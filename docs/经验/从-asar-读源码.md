# 从 app.asar 里读 DSH 自己的源码

想改 DSH 的外观或行为，靠猜类名和接口是没用的 —— 答案都在 `app.asar` 里。
但 asar 不是普通目录，常规工具全都会翻车。

```powershell
$asar = 'C:\Users\Administrator\AppData\Local\Programs\DeepSeek Harness\resources\app.asar'
```

---

## 一、不要用 `read` 工具直接读 asar 里的文件

会抛 `Cannot mix BigInt and other types`（asar 的 header 是二进制 pickle，
文件系统层解析不了）。也**不要**用 PowerShell 的 `>` 重定向导出内容 ——
它会按控制台编码重新编码，中文和字节全毁。

唯一可靠的办法：自己按 asar 格式切字节，`writeFileSync` 原样写出。

### `dump.cjs` —— 按路径导出单个文件

```js
// usage: node dump.cjs <asar> <inner/path> <outFile>
const fs = require('node:fs');
const [, , asarPath, innerPath, outFile] = process.argv;

const fd = fs.openSync(asarPath, 'r');
const head = Buffer.alloc(16);
fs.readSync(fd, head, 0, 16, 0);
const pickleSize = head.readUInt32LE(4);   // header pickle 长度
const jsonSize = head.readUInt32LE(12);    // header JSON 长度

const jsonBuf = Buffer.alloc(jsonSize);
fs.readSync(fd, jsonBuf, 0, jsonSize, 16);
const header = JSON.parse(jsonBuf.toString('utf8'));
const dataOffset = 8 + pickleSize;         // 8 = 两个 uint32

const all = [];
(function walk(node, prefix) {
  for (const [name, value] of Object.entries(node.files || {})) {
    const full = prefix + '/' + name;
    if (value.files) walk(value, full);
    else all.push({ path: full, size: Number(value.size), offset: Number(value.offset) });
  }
})(header, '');

const hit = all.find((f) => f.path === innerPath);
if (!hit) { console.error('not found: ' + innerPath); process.exit(1); }
const buf = Buffer.alloc(hit.size);
fs.readSync(fd, buf, 0, hit.size, dataOffset + hit.offset);
fs.writeFileSync(outFile, buf);
```

**坑**：`unpacked: true` 的条目（原生 `.exe` / `.dll`）**没有 `offset`**，
`Number(undefined)` 是 `NaN`，`readSync` 会抛 `ERR_OUT_OF_RANGE`。
遍历时先 `if (!Number.isFinite(f.offset)) continue;` 跳过它们 —— 那些文件在
`app.asar.unpacked/` 里，用普通 `fs` 读。

**坑**：asar 里有一万两千多个条目，header JSON 有三四 MB。
从 `process.argv` 取路径时注意下标（`node x.cjs a` → 参数在 `argv[2]`），
拿错了会把脚本自己当 asar 打开，报一个莫名其妙的 `ERR_STRING_TOO_LONG`。

---

## 二、`asar-grep.cjs` —— 不解包直接搜内容

找东西时，先搜再 dump，比漫无目的地导出快得多。

```js
// usage: node asar-grep.cjs <asar> <needleLiteral> [pathRegex] [maxHits] [windowChars]
const fs = require('node:fs');
const [, , asarPath, needle, pathReArg, maxArg, winArg] = process.argv;
const pathRe = pathReArg ? new RegExp(pathReArg) : null;
const max = Number(maxArg ?? 40), win = Number(winArg ?? 160);

const fd = fs.openSync(asarPath, 'r');
const head = Buffer.alloc(16); fs.readSync(fd, head, 0, 16, 0);
const pickleSize = head.readUInt32LE(4), jsonSize = head.readUInt32LE(12);
const jsonBuf = Buffer.alloc(jsonSize); fs.readSync(fd, jsonBuf, 0, jsonSize, 16);
const header = JSON.parse(jsonBuf.toString('utf8'));
const dataOffset = 8 + pickleSize;

const all = [];
(function walk(node, prefix) {
  for (const [name, value] of Object.entries(node.files || {})) {
    const full = prefix + '/' + name;
    if (value.files) walk(value, full);
    else all.push({ path: full, size: Number(value.size), offset: Number(value.offset) });
  }
})(header, '');

let hits = 0, scanned = 0;
outer:
for (const f of all) {
  if (pathRe && !pathRe.test(f.path)) continue;
  if (f.size > 6 * 1024 * 1024) continue;              // 超大客户端 bundle 先跳过
  if (!Number.isFinite(f.offset)) continue;            // unpacked，读不到
  scanned++;
  const buf = Buffer.alloc(f.size);
  fs.readSync(fd, buf, 0, f.size, dataOffset + f.offset);
  const text = buf.toString('utf8');
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) {
    console.log(`--- ${f.path} @${i} ---`);
    console.log(text.slice(Math.max(0, i - win), i + needle.length + win).replace(/\s+/g, ' '));
    if (++hits >= max) break outer;
  }
}
console.error(`(scanned ${scanned} entries, ${hits} hit(s))`);
```

用**字面量**搜索而不是正则，省掉一层转义地狱。路径正则用来收窄范围，
比如 `'plugin-manager|app-boot'`。

> `scanned` 数的是**通过路径过滤之后**的条目数，不是 asar 总数 —— 别被它误导。

### `find.cjs` 是搜「文件」的，不是搜 asar 的

另一个小工具，对**单个已导出的文件**做带上下文的正则搜索。
压缩成一行的 bundle 用普通 grep 只会看到一坨，这个能打印命中点前后 N 个字符：

```js
// usage: node find.cjs <file> <regex> [windowChars] [maxMatches]
const fs = require('node:fs');
const [, , file, pattern, winArg, maxArg] = process.argv;
const win = Number(winArg ?? 90), max = Number(maxArg ?? 40);
const text = fs.readFileSync(file, 'utf8');
const re = new RegExp(pattern, 'g');
let m, n = 0;
while ((m = re.exec(text)) !== null) {
  if (m[0] === '' && re.lastIndex === m.index) re.lastIndex++;
  console.log(`--- #${++n} @${m.index} ---`);
  console.log(text.slice(Math.max(0, m.index - win), m.index + m[0].length + win).replace(/\s+/g, ' '));
  if (n >= max) break;
}
```

---

## 三、杀手锏：用 DSH 自己的模块图跑脚本，**不重启就验证配置改动**

改 `cordis.patch.yml` / profile 配置之后，「等重启看看」是最糟的验证方式 ——
起不来就是白屏，而且没法回滚验证。

DSH 自带一个 Node：`resources\runtime\bin\node.cmd`

```bat
@echo off
set ELECTRON_RUN_AS_NODE=1
"%DSH_DESKTOP_NODE_EXECUTABLE%" --expose-internals %*
```

关键是 **Electron 打了补丁的 `fs` 即使在 `ELECTRON_RUN_AS_NODE=1` 下也能读 asar**，
所以可以用普通 Node 的写法 `import()` asar 里的模块，
而它内部的裸导入（`yaml` 等等）会照常在 asar 的 `node_modules` 里解析 ——
**和真实启动走的是同一套代码**。

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& 'C:\Users\Administrator\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe' '.\_ref\compose-check.cjs'
```

```js
// compose-check.cjs —— 组合 profile，打印最终 patch 层，一行都不用真启动
const { pathToFileURL } = require('node:url');
const RES = 'C:/Users/Administrator/AppData/Local/Programs/DeepSeek Harness/resources/app.asar/dsh';
const PROFILE_DIR = 'D:/DSH/home/profiles/desktop';

(async () => {
  const mod = await import(pathToFileURL(`${RES}/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js`).href);
  const profile = mod.loadProfileDirectory('dsh', PROFILE_DIR, RES);

  for (const layer of profile.layers) {
    console.log(`bundle ${layer.packageName}: ${layer.patches.length} 条 patch`);
    for (const p of layer.patches) console.log('   ', JSON.stringify(Object.keys(p)), p.id ?? '');
  }
  console.log('profile 层:', profile.patches.length, '条');
  console.log('被跳过的 bundle:', JSON.stringify(profile.skippedBundles, null, 2));
})();
```

`loadProfileDirectory` 就是启动时走的那条路：解析 `dsh.profile.bundles`、
读每个 bundle 的 `dsh.bundle.patch`、再把 profile 自己的 `cordis.patch.yml`
叠上去。**它打印什么，启动就是什么。**

这个手段验证过两件事，都不用重启：

- 把一行 `insert` 从 bundle patch 挪到 profile patch，确认它在新层里出现了；
- 确认 bundle patch 里只剩美化那一行、没有重复行。

---

## 四、顺手记下的 patch 语义

`applyEntryPatches`（在 `dsh-app-boot/lib/index.js`）是这个 patch 系统的全部真相：

```js
if (insert) {
  if (id) {                       // 有 id：插进那个已存在的 group 的 config 里
    const target = entryMap.get(id);
    if (!target) { warn('patch insert: entry %C not found', id); continue; }
    if (!target.group) { warn('patch insert: entry %C is not a group', id); continue; }
    target.config.push(...insert);
  } else data.push(...insert);    // 没有 id：直接追加到顶层
  buildMap(insert);               // 同一份 patch 列表里，后面的 patch 能命中刚插进来的行
  continue;
}
```

两个直接后果：

1. **`- insert:` 不带外层 `id` 是「追加」，不是「替换」。** 两个 patch 层插入
   同一个 `id` 的行，结果就是**这一行出现两次**，不会自动去重。
   把一行从 bundle 层搬到 profile 层时，中间会有一段时间两边都在 → 重复。
   所以搬的时候要**先删旧的、再确认新的**，别两边同时挂着。
2. 带 `id` 的 insert 只能插进 **group**。想插不存在的 id 会 warn 然后跳过。

另外 `loadOverlayPatches` 对**不存在的文件是抛错**的，而这个抛错在
`loadProfileDirectory` 里被 per-bundle 的 `try/catch` 吃掉 → **整个 bundle 被跳过**
（只在 stderr 留一行）。所以 `dsh.bundle.patch` 里**永远不要**写一个
「本机才有、仓库里没有」的文件名 —— 换台机器整个插件就静默失效了。

---

## 五、编码

导出的文件**只**用 `fs.writeFileSync` / `dump.cjs` 写；读只用自己的 `read` 工具。
一旦碰了 `Get-Content` / `Set-Content` / `>`，中文就没了 ——
详见 [powershell-utf8陷阱.md](powershell-utf8陷阱.md)。

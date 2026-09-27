# 别用 PowerShell 改含中文的源文件

在 `client.js`（UTF-8 无 BOM，含大量中文 UI 文案）上执行：

```powershell
(Get-Content client.js -Raw) -replace 'a','b' | Set-Content client.js -NoNewline -Encoding utf8
```

**文件被毁了。** `Get-Content` 用系统 ANSI 代码页（cp936/GBK）解码了 UTF-8 字节，
`Set-Content -Encoding utf8` 再按 UTF-8 写回 —— 全部中文变成 `妯″紡` 这类乱码，
而且 `node --check` 会因为字符串里冒出意外标识符而失败。

## 规矩

**不要在含非 ASCII 的文件上用 `Get-Content` / `Set-Content` / `>` 重定向做原地改写。**

用编辑器/写文件工具，或者 node 的 `fs.writeFileSync`。

同理，**不要把命令的输出用 `>` 重定向成文件** —— pwsh 会重新编码，二进制和 UTF-8 都会毁。
需要导出文件时让 node 自己写。

---

## 已经发生了怎么办：可以无损还原

### 第一步：反向变换

```powershell
$s = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$bytes = [System.Text.Encoding]::GetEncoding(936).GetBytes($s)   # 936 = cp936/GBK
[System.IO.File]::WriteAllBytes($path, $bytes)
```

> **坑**：.NET 的"当前目录"和 pwsh 的 `cd` **不是一回事**。
> 必须传**绝对路径**，否则报 `未能找到文件`。

### 第二步：补回残余损坏

反向之后**还没完**。GBK 遇到非法双字节对时会吐出一个 `?`，
**同时吃掉「多字节字符的最后一个字节」和「紧随其后的那个 ASCII 字符」**。

所以每个损坏点在反向后的文本里表现为 **`\uFFFD` + `?` 两个字符**，
而它们对应原文里**正好两个字符**（通常是一个中文标点 + `'`，比如 `。'`、`；0`、`、-`）。

按出现顺序列一张替换表，逐个补回。写个脚本断言：
**损坏点数量 == 替换表长度**，对不上就报错退出 —— 免得文本整体错位。

### 第三步：验证（关键）

1. `node --check` 通过
2. 全文件 `\uFFFD` 计数为 **0**
3. **把所有含中日韩字符的行打印出来，肉眼过一遍**

**第 3 步不能省。** 被吃掉的字节也可能恰好替换成一个合法 ASCII，
形成**不报错的静默错误** —— 那次 71 处里就有一处把「压到 70%」补成了「压到770%」，
`node --check` 完全看不出来，是逐行比对抓出来的。

---

## 教训

**省一步命令行的力气，赔上的是整个文件的可信度。**
含非 ASCII 的文件，永远用有编码保证的写入路径。

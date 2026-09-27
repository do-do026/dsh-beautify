# dsh-beautify

给 **DSH 桌面端**（DeepSeek Harness）做的客户端美化 bundle。

一个 bundle 包，装进 profile 就能用：不需要构建、没有依赖、没有安装脚本。
**纯 CSS 和主题 token，不做 DOM 手术**，所以界面更新时最坏的结果是样式不生效，
不会把 React 树搞崩。

---

## 它做了什么

| 功能 | 说明 |
|---|---|
| **背景** | 导入一张本地图，调不透明度和高斯模糊；不导入就用内置渐变 |
| **水玻璃材质** | 玻璃模糊 / 饱和 / 上沿高光 + 可选的水波纹贴图；作用于左侧栏、菜单弹层、气泡 |
| **气泡** | 用户气泡调色 + 透明度 + 圆角 + 毛玻璃；AI 回复按 markdown 块切成一个个气泡，短句自动贴合内容 |
| **头像** | 两侧头像可导入，九宫格选裁剪焦点（存原图，不烘焙） |
| **waifu 模式** | 一键开关：AI 头像 + AI 回复装进气泡。开关在会话标题栏右上角 |
| **右栏角色卡** | 立绘 + 表情切换 + 名字 + 一句设定，卡面背景可导入 |
| **悬浮立绘** | 让立绘站在界面一角（四角可选、大小/透明度/水平垂直微调），`pointer-events:none` 永不挡点击 |

配置入口：**设置 → 美化** 和 **设置 → 角色卡**（两栏并列）。

---

## 装法

### 从 GitHub 装（换电脑就这一步）

1. **设置 → 插件 → 添加插件**
2. 粘贴仓库地址：

   ```
   https://github.com/do-do026/dsh-beautify
   ```

3. 装完在 **设置 → 插件** 里能看到它（默认启用）。没出现就刷新一下页面。
4. 回 **设置 → 美化** 开始调。

不需要重启、不需要构建、没有依赖。

### 从本地文件夹装（改代码时用）

1. 把仓库克隆到一个稳定的路径（**别放临时目录**，profile 里存的是它的路径）
2. 在 DSH profile 的 `package.json` 里加一条依赖：

   ```json
   {
     "dependencies": {
       "@local/dsh-beautify": "link:<这个文件夹的绝对路径>"
     }
   }
   ```

3. 让 DSH 装上它：**设置 → 插件** 里启用 `@local/dsh-beautify`，
   或让 agent 调 `plugin_manager` 的 `install_bundle` / `set_bundle`。
4. 刷新页面。

---

## 改完之后怎么生效

| 改了什么 | 怎么生效 |
|---|---|
| `client.js` | **热重载** —— 存盘就变，不用刷新、不用重启 |
| `package.json`、`cordis.patch.yml` | **要重启应用**（它们是加载时读的） |
| `icon.svg`、`locale/*.json` | 插件页的显示信息，重启后刷新 |

改完 `client.js` 记得先 `node --check client.js` —— 语法错会让整个客户端半边加载失败。

---

## 卸载 / 出问题

在 **设置 → 插件** 里禁用 `@local/dsh-beautify` 就行。
**禁用不会丢任何东西** —— 插件源码在磁盘上，调好的参数存在浏览器 localStorage 里。

如果应用起不来：先禁用这个 bundle 再排查。
最常见的一个起因写在 [docs/经验/两个-inject.md](docs/经验/两个-inject.md)。

---

## 目录

```
.
├── package.json         bundle 声明（dsh.bundle.patch / dsh.client / icon / files）
├── cordis.patch.yml     插入美化插件那一行
├── index.js             宿主半边（现在是个空壳）
├── client.js            全部功能，都在客户端这一半
├── icon.svg             插件页里的图标
├── locale/              插件页里的名字和说明（en / zh）
└── docs/
    ├── 交接单.md        DSH 客户端插件开发实录：能用的接口、类名、坑
    └── 经验/
        ├── 两个-inject.md
        ├── powershell-utf8陷阱.md
        └── 从-asar-读源码.md
```

---

## 已知的限制

- **素材不进仓库。** 背景图、头像、立绘都只存浏览器 localStorage 里的路径和裁剪参数，
  换机器要重新导入。插件不打包也不复制用户的图片。
- **不支持 Live2D / VRM。** 动态立绘是刻意不做的 —— 静态立绘 + 表情切换够用，
  而且不用背运行时。
- **不去动 React 管的节点。** 宁可样式失效也不做 DOM 手术，见上面那句。
- **`private: true` 是故意的。** 包名是 `@local/dsh-beautify`，本来也不打算发 npm；
  从 git 装完全不受影响。
- 插件页显示的是 `locale/zh.json` 里的名字。如果哪天它变回一长串包名，
  说明 `package.json` 的 `exports` 里少了 `"./package.json"` 或 `"./locale/*.json"`
  —— DSH 找不到这两个路径时会**静默**退回包名。

---

## License

MIT，见 [LICENSE](LICENSE)。

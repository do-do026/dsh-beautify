# DSH 插件有两个 inject —— 这里翻过一次车，整个应用打不开

DSH 客户端插件里有**两个同名叫 inject 但完全不同的东西**。

| | 在哪 | 内容 | 行为 |
|---|---|---|---|
| **A. 包依赖清单** | `package.json` 的 `dsh.client.inject` | **包名**数组 | 加载器**启动时校验**，解析不到 → **整个 bundle 拒绝加载** |
| **B. cordis 服务声明** | 插件返回对象里的 `inject` | **服务名**数组 | cordis **等**服务就绪，**不会失败** |

```js
// A —— package.json，危险
"dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-conversation"] } }

// B —— client.js，安全
return { inject: ['slots', 'theme', 'sidebarRightTabs'], apply(ctx) { … } };
```

---

## 事故经过

往 **A** 里加了一行 `"@deepseek-ai/dsh-client-ui-sidebar-right"`（本意是想拿到右栏的服务）：

1. 客户端热重载**立刻失败** → **界面退回全白原生样式**
2. 重启 → **应用整个打不开**，要在插件管理里「禁用所有第三方插件」才进得去

**原因**：这个 profile 是 `link:` 安装的，它的 `node_modules` 里没有 DSH 内置包，
A 里写包名解析不到，于是 bundle 在加载阶段就被拒绝了。

---

## 正确的做法

**想用 `ctx` 上的某个服务，只能改 B。**

```js
return { inject: ['slots', 'theme', 'sidebarRightTabs'], apply(ctx) { … } };
```

**B 里没声明的服务，读取时直接抛错**：

```
cannot get property "sidebarRightTabs" without inject
```

**不是返回 `undefined`** —— 所以「先 `if` 检查一下有没有再决定」这种防御写法
**根本走不到判断那一步**，在读取的瞬间就抛了。

这条最容易绊人：写惯了防御式代码的人第一反应一定是加 `if`，但那个 `if` 本身就会炸。

---

## 出事了怎么救

1. **设置 → 插件** 里禁用出事的 bundle（它只是禁用，源码和配置都不会丢）
2. 改回 `client.js` / `package.json`
3. 重新启用，看返回的 `application` 是不是 `applied`

如果应用已经起不来：启动时选**禁用所有第三方插件**，进去之后再改。

---

## 排查手法：把自检打在屏幕上

在有界面的插件里，与其猜，不如**在插件自己的设置面板里渲染一行状态**：

```
右栏接口：已拿到，角色卡已注册
右栏接口：拿不到（ctx 上没有 sidebarRightTabs）
右栏接口：注册时报错 —— cannot get property "sidebarRightTabs" without inject
```

外加一行「**已声明的服务**：`slots ✔ · theme ✔ · sidebarRightTabs ✔`」。

这次就是靠它一眼看到那句报错才定性的。**没有浏览器控制的时候，这比读代码快一个数量级。**

> 注意：探针**只列插件自己声明过的服务**。列出没声明的会全打 ✘，一眼看去像"全坏了"，
> 其实只是"没声明" —— 那是个会误导自己的假象。

---

## 一句话

**改注入时：先改 cordis 服务声明（安全），绝不动包依赖清单。**
真要动包依赖清单，先让用户单独测一次启动。

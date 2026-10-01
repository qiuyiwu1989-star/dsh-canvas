# 思考画布 · Thinking Canvas

**把一次会话摊开成一张可以拖动、可以缩放、可以追到出处的图。**

DeepSeek Harness 的对话是一列从上往下的流。流适合读,不适合看结构:哪一句是你的意图、
哪一段是 AI 的判断、哪一次工具调用才是真正改了文件的动作、你在第几轮改过主意——
这些关系在一条直线上是看不出来的。

这个插件在对话视图环里加一个「画布」页签,把当前会话渲染成一张卡片地图。每张卡片都带着
它对应那条记录的 `anchorSeq`,所以画布上的任何一张卡都能回到会话里那一条。

[English](README.md) | 中文

---

## 装上

```sh
dsh plugin --profile <你的 profile> add github:qiuyiwu1989-star/dsh-canvas
```

`dsh plugin` 把参数转给 profile 目录里的 pnpm,然后按安装结果对账 `dsh.profile.bundles`:
这个包声明了 `dsh.bundle`,所以会自动进入 bundle 层列表。**重启应用生效**(profile 是启动时读的)。

profile 名就是启动时那个:`dsh web` 用的是 `web`,自定义启动用你传的那个名字。
拿不准的话看 `$DSH_HOME/profiles/` 下哪个目录最近还在写。

没有 `prepare` 脚本,所以不需要往 `pnpm-workspace.yaml` 的 `allowBuilds` 里加任何东西——
这个仓库没有构建步骤,`lib/` 就是源码。

不想走 pnpm 也可以直接挂补丁:

```sh
dsh web --patch /path/to/dsh-canvas/cordis.patch.yml
```

卸载:

```sh
dsh plugin --profile <你的 profile> remove dsh-canvas
```

### 装完之后应该看到什么

宿主半侧会在启动时把插件扫描进客户端启动图。真的启动一次,页面里有这一行就说明接上了:

```json
{
  "id": "dsh-canvas",
  "url": "/plugins/??dsh-canvas/client.js&rev=...",
  "inject": ["@deepseek-ai/dsh-client-ui-conversation"]
}
```

它会被排进 application combo,位置就在它声明依赖的那个包之后。

## 用它

打开任意一次会话,在对话区顶部的页签里选 **画布**。

| 动作 | 怎么做 |
| --- | --- |
| 平移 | 在空白处按住拖动 |
| 缩放 | 滚轮(以光标为中心),或工具条上的 `−` / `+` |
| 全览 | 工具条上的「全览」 |
| 看原文 | 点一张卡片,右侧显示它的全文、轮次、步骤、序号 |
| 选卡片 | 卡片右上角的 `＋`,或详情面板里的「加入待用」 |
| 找内容 | 工具条的搜索框;「淡化其他 / 隐藏其他」决定没命中的卡片怎么处理 |
| 只看一类 | 点角色筛选条;再点一次排除;点「全部」复位 |
| 移动卡片 | 直接拖卡片,位置按会话记下来 |
| 取消选择 | `Esc` |
| 导出 | 底部:选中导出 Markdown(带出处)或整张画布导出 JSON |

## 卡片角色

画布不按事件的线上形状分类,按「这是谁贡献的」分类。

| 角色 | 对应会话里的什么 |
| --- | --- |
| 我的意图 | 你发出的消息 |
| 我的选择 | steering——你在 AI 干活中途插进去的纠正 |
| AI 的贡献 | 助手的每一步回答(思考过程单独收在卡片详情里) |
| 工具动作 | 工具调用,标题就是工具名 |
| 成果 | 轮次收尾 |
| 上下文 | 注入的上下文与系统提示词 |
| 系统 | 压缩、重试、过程折叠 |
| 出错 | 轮次错误与触顶 |
| 其他 | 未识别的事件类型 |

## 示例画布

没有会话可画时(空会话),画布会给你一个五张卡的示例——一个虚构的社区读书会报名页,
从意图到交付。**全部虚构**,不含任何真实转写、人名或文件。示例数据也提交在
[`examples/sample-canvas.json`](examples/sample-canvas.json)。

## 边界

- **只读。** 画布只读会话快照,不改会话、不写文件、不调模型、不发网络请求。
- **只画已加载的那一段窗口。** 和 Chat/Trajectory 一样,它读的是客户端当前驻留的会话窗口。
  更早的历史要在对话里加载出来才会进入画布——画布不会偷偷去拉全量历史。
- **不进模型上下文。** 画布是纯浏览器侧插件,宿主半侧是空的;它不注册工具、不写系统提示词,
  所以模型看不见它。
- **v0.1 不能从画布跳回对话。** 反向定位还没做。目前能靠「轮次 / 步骤 / 序号」自己找。
- **同一时刻只有一份样式。** 第二次激活不会再插一份 CSS,也不会把第一份的所有权抢走。

## 状态存在哪

全部在浏览器本地,不上传:

| 键 | 内容 |
| --- | --- |
| `dsh-canvas:view:<sessionId>` | 平移与缩放 |
| `dsh-canvas:layout:<sessionId>` | 你手动拖过的卡片位置 |

清掉这两类键就回到默认布局。localStorage 不可用时(隐私模式、配额满),画布照常工作,只是不记事。

## 为什么没有构建步骤

DSH 的客户端 bundle 不是 ES module,而是 `window.__ModuleLoader__.load({ id, factory })`
这种「注册一个工厂、物化时才跑模块体」的格式;`require` 从外壳冻结的模块表里取 React。
这个格式是可以直接手写的,所以本仓库:

- `lib/client.js` 就是源码,没有 `src/`,没有 tsdown,没有第二个产物;
- 运行时依赖为零——`dependencies`、`peerDependencies`、`devDependencies` 全空;
- `pnpm add github:...` 不需要 `allowBuilds`,因为没有任何脚本要跑。

代价是类型靠 JSDoc 与测试而不是编译器。换来的是:任何人 clone 下来就能读、能改、能测。

## 开发

```sh
node --test test/*.test.mjs   # 契约测试
node scripts/smoke.mjs        # 端到端:加载 bundle、挂载、渲染、导出、比对示例
node scripts/smoke.mjs --write  # 改了示例后重新生成 examples/sample-canvas.json
```

测试不需要浏览器,也不需要装任何东西。`test/harness.mjs` 用一个 `node:vm` 上下文提供
`window` / `document` / `navigator`,用一套桩 React 按真实顺序走一遍渲染路径——
函数组件会被展开,`useEffect` 在挂载时执行一次。所以「注册了什么」「渲染出几张卡」
「卸载会不会留下样式」都是被真跑出来断言的,不是靠读代码。

`test/sanitize.test.mjs` 是发布闸门:它扫全树的文本文件,撞到人名、绝对家目录路径、
私有域名、服务器地址、凭据形状的串就失败。

## 目录

```
lib/index.js          宿主半侧(空壳 —— 有行才有 bundle 被发现)
lib/client.js         浏览器半侧:画布本身
cordis.patch.yml      往 profile 插一行
docs/ARCHITECTURE.md  数据契约:读什么、从哪读、为什么这么分类
examples/             虚构示例数据
test/                 契约测试 + 发布闸门
scripts/smoke.mjs     无浏览器的端到端自检
```

## 兼容性与验证

针对 DeepSeek Harness `0.1.2-rc.1` 的客户端槽位契约编写与实测,桌面应用 `0.8.2`。
它只依赖 `slots` 这一个客户端 Service,`locale` 是可选依赖——没有也能跑,只是文案退回
`navigator.language`。

发布前在**真实启动**里验过一遍(隔离的 `DSH_HOME`,没有碰任何现有会话):profile 组合出
画布行 → 客户端模块系统把它扫进启动图 → `/plugins` combo 里带着本仓库的 bundle 发出来。
上面「装完之后应该看到什么」那一行就是那次启动里的实录。

## 许可

[MIT](LICENSE)。仓库只包含通用实现与虚构示例,不含任何真实会话、逐字稿、客户信息或凭据。

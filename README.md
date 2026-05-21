# OpenCode Server 插件模板

基于 [OpenCode 插件开发文档](https://opencode.ai/docs/zh-cn/plugins/) 的 Server 插件模板，开箱即用。

## 使用方式

### 1. 基于模板创建仓库

点击 GitHub 上的 **Use this template**，或直接克隆：

```bash
git clone <your-repo-url> my-opencode-plugin
cd my-opencode-plugin
npm install
```

### 2. 修改基本信息

**`package.json`** — 替换包名和描述：

```json
{
  "name": "your-plugin-name",
  "version": "1.0.0",
  "description": "你的插件描述"
}
```

**`src/index.ts`** — 替换插件 ID 和 Options 类型（第 13 行）：

```ts
type Options = {
  // 用户在 opencode.json 中传入的自定义参数
  enableLogging?: boolean
}

export default {
  id: "your-plugin-name",
  server: async (input, options: Options = {}) => {
    // ...
  },
}
```

### 3. 选择需要的钩子

模板包含 OpenCode 全部 17 个钩子的示例代码。按以下三步操作：

- **保留**：已激活的 10 个钩子，按需修改逻辑
- **启用**：注释掉的 9 个钩子，取消注释即可
- **删除**：不用的钩子和示例 Tool 直接删掉

### 4. 定义自定义 Tool

在 `tool` 块中添加 LLM 可调用的工具：

```ts
tool: {
  your_tool_name: tool({
    description: "工具描述 — LLM 据此判断何时调用",
    args: {
      param1: tool.schema.string().describe("参数说明"),
      param2: tool.schema.number().optional().default(10).describe("可选参数"),
    },
    async execute(args, ctx) {
      // args — 类型安全的参数（由 Zod schema 推导）
      // ctx  — { sessionID, messageID, agent, directory, worktree, abort, metadata(), ask() }
      return "result"
      // 或结构化返回: { title: "标题", output: "内容", metadata: { key: "value" } }
    },
  }),
}
```

### 5. 本地调试

```bash
# 终端 1：启动开发服务器（加载项目中的 .opencode/plugins/）
opencode serve --port=4096

# 终端 2：连接 TUI
opencode attach http://localhost:4096
```

插件加载方式（任选其一）：

| 方式 | 操作 |
|------|------|
| 自动发现 | 放入项目的 `.opencode/plugin/` 目录 |
| 配置声明 | 在 `opencode.json` 中添加 `"plugin": ["./path/to/plugin.ts"]` |
| CLI 安装 | `opencode plugin ./path/to/plugin` |

带选项的配置方式：

```json
{
  "plugin": [
    ["./plugins/my-plugin.ts", { "enableLogging": true }]
  ]
}
```

### 6. 发布到 npm

```bash
npm publish
```

发布后用户可直接通过包名安装：

```bash
opencode plugin your-plugin-name
```

## 钩子速查

| 钩子 | 文档章节 | 模板状态 | 用途 |
|------|---------|---------|------|
| `tool` | 4.1 | 已激活 | 注册 LLM 可调用的自定义工具 |
| `chat.message` | 4.2 | 已激活 | 拦截用户消息（用户可见） |
| `chat.params` | 4.3 | 已激活 | 修改 LLM 请求参数 |
| `chat.headers` | 4.4 | 已激活 | 修改 LLM 请求头 |
| `chat.messages.transform` | 4.5 | 注释 | 变换消息历史（用户不可见） |
| `chat.system.transform` | 4.6 | 已激活 | 修改系统提示词 |
| `tool.execute.before` | 4.7 | 已激活 | 工具执行前拦截（可阻止） |
| `tool.execute.after` | 4.8 | 已激活 | 工具执行后修改结果 |
| `tool.definition` | 4.9 | 注释 | 修改发送给 LLM 的工具定义 |
| `permission.ask` | 4.10 | 已激活 | 拦截权限询问 |
| `command.execute.before` | 4.11 | 注释 | 命令执行前拦截 |
| `shell.env` | 4.12 | 已激活 | 注入 Shell 环境变量 |
| `session.compacting` | 4.13 | 注释 | 自定义会话压缩策略 |
| `compaction.autocontinue` | 4.14 | 注释 | 控制压缩后是否自动继续 |
| `text.complete` | 4.15 | 注释 | 自定义文本补全 |
| `event` | 4.16 | 已激活 | 事件监听总线 |
| `config` | 4.17 | 注释 | 配置变更回调 |
| `auth` | 第五章 | 注释 | 接入 OAuth / API Key 认证 |
| `provider` | 第六章 | 注释 | 自定义模型提供商 |

## 目录结构

```
your-plugin/
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
└── src/
    └── index.ts          # 插件入口（所有钩子都在这里）
```

> 复杂插件可按文档推荐的模块化结构拆分为 `hooks/`、`tools/`、`types.ts` 等目录。

## 注意事项

1. **不要引入 `@opencode-ai/sdk`** — 类型用 `@opencode-ai/plugin`，SDK 客户端由运行时注入
2. **文件插件必须声明 `id`** — npm 包可省略（默认用 `package.json` 的 `name`）
3. **阻塞工具执行用 `throw new Error()`** — 在 `tool.execute.before` 中抛出即可
4. **Shell 命令避免拼接用户输入** — 防止命令注入
5. **实验性钩子 API 可能变更** — 以 `experimental.` 开头的钩子谨慎依赖
6. **一个包只能导出 `server` 或 `tui`** — 不能同时导出
7. **工厂函数是异步的** — 可做初始化工作（连接数据库等），但会阻塞服务器启动

## 参考资源

| 资源 | 链接 |
|------|------|
| 官方插件文档 | https://opencode.ai/docs/zh-cn/plugins/ |
| 插件系统深度解析 | https://deepwiki.com/sst/opencode/7.3-plugin-system |
| 社区插件合集 | https://github.com/ericc-ch/opencode-plugins |
| 官方内置插件源码 | OpenCode 仓库 `packages/opencode/src/plugin/` |

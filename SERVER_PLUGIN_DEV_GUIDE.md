# OpenCode Server 插件开发指南

## 一、概述

Server 插件是运行在 opencode 后端进程中的 TypeScript/JavaScript 模块，通过**钩子系统（Hooks）**扩展 opencode。

### 能力范围

| 能力 | 对应钩子 |
|------|---------|
| 注册 LLM 可调用的自定义工具 | `tool` |
| 接入 OAuth / API Key 认证 | `auth` |
| 添加自定义模型提供商 | `provider` |
| 修改聊天参数/请求头 | `chat.params` / `chat.headers` |
| 拦截和修改用户消息 | `chat.message` |
| 拦截工具执行（修改参数/结果/阻止） | `tool.execute.before` / `tool.execute.after` |
| 修改发送给 LLM 的工具定义 | `tool.definition` |
| 拦截权限询问 | `permission.ask` |
| 注入 Shell 环境变量 | `shell.env` |
| 转换消息历史/系统提示词 | `chat.messages.transform` / `chat.system.transform` |
| 自定义 session 压缩策略 | `session.compacting` |
| 监听所有系统事件 | `event` |
| 注册自定义工作区类型 | `experimental_workspace.register()` |

---

## 二、快速开始

### 2.1 最小项目结构

```
my-plugin/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts          # 插件入口
```

### 2.2 package.json

```json
{
  "name": "my-opencode-plugin",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    "./server": "./src/index.ts"
  },
  "main": "./src/index.ts",
  "engines": {
    "opencode": ">=1.14.0"
  },
  "dependencies": {
    "@opencode-ai/plugin": "^1.14.0"
  }
}
```

> **入口查找优先级**：`exports["./server"]` → `main` → `index.ts`（本地文件插件）

### 2.3 第一个插件

```ts
// src/index.ts
import { tool } from "@opencode-ai/plugin/tool"

export default {
  server: async () => ({
    tool: {
      hello: tool({
        description: "Say hello",
        args: { name: tool.schema.string().describe("Your name") },
        async execute(args) {
          return `Hello, ${args.name}!`
        }
      })
    }
  })
}
```

### 2.4 声明和加载

**方式一：配置文件声明**

在 `opencode.json` 或 `.opencode/opencode.json` 中：

```json
{
  "plugin": [
    "my-opencode-plugin",
    "./plugins/my-local-plugin",
    ["./plugins/with-options.ts", { "debug": true }]
  ]
}
```

**方式二：自动发现**

放到 `.opencode/plugin/` 或 `.opencode/plugins/` 下的 `*.ts` / `*.js` 文件会被自动加载。

**方式三：CLI 安装**

```bash
opencode plugin my-opencode-plugin     # npm 包
opencode plug ./local-plugin           # 本地路径
opencode plug -g some-plugin           # 全局安装
```

### 2.5 插件加载顺序

```
全局配置（~/.config/opencode/opencode.json）
  → 项目配置（.opencode/opencode.json）
    → 全局插件目录（~/.config/opencode/plugins/）
      → 项目插件目录（.opencode/plugins/）
```

同名钩子**按加载顺序依次执行**，多个插件可以注册同一个钩子。

### 2.6 调试插件

```bash
# 终端 1：启动开发服务器
opencode serve --port=4096

# 终端 2：连接 TUI
opencode attach http://localhost:4096
```

---

## 三、入口函数

### 3.1 类型签名

```ts
type Plugin = (
  input: PluginInput,
  options?: PluginOptions   // 用户在配置中传入的自定义选项
) => Promise<Hooks>
```

插件 default export 必须是一个包含 `server` 函数的对象：

```ts
export default {
  id: "my-plugin",           // npm 包可不写（默认用 package.json name），文件插件必须写
  server: async (input, options) => {
    return { /* Hooks */ }
  }
}
```

> **注意**：一个包只能导出 `server` 或 `tui`，不能同时导出。

### 3.2 PluginInput

```ts
type PluginInput = {
  // SDK REST 客户端 — 调用 opencode 全部 API
  client: ReturnType<typeof createOpencodeClient>

  // 当前项目信息
  project: {
    id: string; worktree: string; name: string
    vcs: "git" | null; sandboxes: string[]
  }

  // 目录上下文
  directory: string           // 当前工作目录
  worktree: string            // git 仓库根目录

  // 当前 opencode server 地址
  serverUrl: URL

  // Bun Shell 接口
  $: BunShell

  // 实验性：注册自定义工作区类型
  experimental_workspace: {
    register(type: string, adaptor: WorkspaceAdaptor): void
  }
}
```

### 3.3 PluginOptions

用户在配置中传入的自定义参数，类型为 `Record<string, unknown>`：

```json
{
  "plugin": [
    ["my-plugin", { "apiEndpoint": "https://custom.api.com", "retries": 3 }]
  ]
}
```

---

## 四、Hooks 完整参考

### 4.1 tool — 注册自定义工具

插件最常用的钩子，注册 LLM 可调用的工具。

```ts
import { tool } from "@opencode-ai/plugin/tool"

tool({
  description: "工具描述（LLM 用来判断何时调用）",
  args: {
    param1: tool.schema.string().describe("参数说明"),
    param2: tool.schema.number().optional().default(10)
  },
  async execute(args, ctx) {
    // args: 类型安全的参数（由 Zod schema 推导）
    // ctx: ToolContext
    return "result"
    // 或: { output: "result", metadata: { key: "value" } }
  }
})
```

**ToolContext**：

```ts
type ToolContext = {
  sessionID: string          // 当前 session ID
  messageID: string          // 触发此工具的消息 ID
  agent: string              // 当前 agent 名称
  directory: string          // 当前项目目录
  worktree: string           // 工作树根目录
  abort: AbortSignal         // 用于取消长时间操作

  // 设置工具执行的元数据（会显示在 UI 中）
  metadata(input: { title?: string; metadata?: object }): void

  // 向用户请求权限（如请求文件读写授权）
  ask(input: {
    permission: string
    patterns: string[]
    always: string[]
    metadata: object
  }): Effect.Effect<void>
}
```

### 4.2 chat.message — 拦截用户消息

**用户发送消息时触发，修改对用户可见。**

```ts
"chat.message": async (input, output) => {
  // input: { sessionID, agent?, model?, messageID?, variant? }
  // output: { message: UserMessage, parts: Part[] }

  // 修改用户消息（用户在 TUI 中会看到修改后的内容）
  if (output.message.includes("关键词")) {
    output.parts.push({ type: "text", text: "\n[附加指令...]" })
  }
}
```

### 4.3 chat.params — 修改 LLM 请求参数

**在 API 调用前修改发送给 LLM 的参数。**

```ts
"chat.params": async (input, output) => {
  // input: { sessionID, agent, model, provider, message }
  output.temperature = 0.5
  output.topP = 0.9
  output.topK = 40
  output.maxOutputTokens = 16000
  output.options["custom_option"] = "value"
}
```

### 4.4 chat.headers — 修改 LLM 请求头

```ts
"chat.headers": async (input, output) => {
  // input: { sessionID, agent, model, provider, message }
  output.headers["x-custom-header"] = "value"
}
```

### 4.5 chat.messages.transform — 变换消息历史（实验性）

**与 `chat.message` 的关键区别：修改对用户不可见，仅 LLM 看到。**

| 钩子 | 用户可见性 |
|------|-----------|
| `chat.message` | 用户在 TUI 中**能看到**修改 |
| `chat.messages.transform` | 用户**看不到**，只有 LLM 收到修改后的内容 |

```ts
"experimental.chat.messages.transform": async (input, output) => {
  // output.messages: Array<{ info: Message, parts: Part[] }>
  // 可以增删改消息，用户无感知
  output.messages.unshift({
    info: { role: "system", ... },
    parts: [{ type: "text", text: "隐藏的系统指令" }]
  })
}
```

### 4.6 chat.system.transform — 修改系统提示词（实验性）

```ts
"experimental.chat.system.transform": async (input, output) => {
  // input: { sessionID?, model }
  // output.system: string[]
  output.system.push("额外指令：用中文回复")
}
```

### 4.7 tool.execute.before — 工具执行前拦截

**可以修改参数，或通过抛出错误来阻止执行。**

```ts
"tool.execute.before": async (input, output) => {
  // input: { tool: 工具名, sessionID, callID }
  // output: { args: 工具参数 }

  // 阻止读取敏感文件
  if (input.tool === "Read" && output.args.file_path?.includes(".env")) {
    throw new Error("禁止读取 .env 文件")
  }

  // 修改参数
  output.args.timeout = 30000
}
```

### 4.8 tool.execute.after — 工具执行后处理

**修改工具结果，在 LLM 看到结果之前。**

```ts
"tool.execute.after": async (input, output) => {
  // input: { tool, sessionID, callID, args }
  // output: { title, output, metadata }

  // 给结果添加前缀
  output.output = `[executed by ${input.tool}]\n${output.output}`
  output.metadata.executedAt = Date.now()
}
```

### 4.9 tool.definition — 修改工具定义

**修改发送给 LLM 的工具描述和参数 schema，不改变工具实际实现。**

```ts
"tool.definition": async (input, output) => {
  // input: { toolID }
  output.description = "增强后的工具描述"
  output.parameters = { /* 修改后的 JSON Schema */ }
}
```

### 4.10 permission.ask — 拦截权限询问

```ts
"permission.ask": async (input, output) => {
  // input: Permission 对象
  output.status = "allow"   // "ask" | "allow" | "deny"
}
```

### 4.11 command.execute.before — 命令执行前

```ts
"command.execute.before": async (input, output) => {
  // input: { command, sessionID, arguments }
  // output.parts: 可以预填充响应
}
```

### 4.12 shell.env — 修改 Shell 环境变量

```ts
"shell.env": async (input, output) => {
  // input: { cwd, sessionID?, callID? }
  output.env["NODE_ENV"] = "development"
  output.env["API_KEY"] = process.env.SECRET_API_KEY ?? ""
}
```

### 4.13 session.compacting — 自定义压缩（实验性）

```ts
"experimental.session.compacting": async (input, output) => {
  // input: { sessionID }
  // 追加到默认压缩提示的上下文
  output.context.push("请保留所有 TODO 项")
  // 或完全替换压缩提示
  // output.prompt = "自定义的压缩提示词..."
}
```

### 4.14 compaction.autocontinue — 控制压缩后行为（实验性）

```ts
"experimental.compaction.autocontinue": async (input, output) => {
  // input: { sessionID, agent, model, provider, message, overflow }
  output.enabled = false  // 压缩后不自动继续
}
```

### 4.15 text.complete — 自定义文本补全（实验性）

```ts
"experimental.text.complete": async (input, output) => {
  // input: { sessionID, messageID, partID }
  output.text = "completion"
}
```

### 4.16 event — 事件总线

**订阅 opencode 的所有系统事件。**

常用事件类型：

| 事件 | 说明 |
|------|------|
| `session.created` | session 创建 |
| `session.updated` | session 更新 |
| `session.deleted` | session 删除 |
| `message.created` | 消息创建 |
| `message.updated` | 消息更新 |
| `part.created` / `part.updated` | 消息部分创建/更新 |
| `tool.execute.before` / `tool.execute.after` | 工具执行 |
| `permission.asked` | 权限询问 |
| `shell.started` / `shell.completed` | Shell 执行 |
| `file.watched` / `file.changed` | 文件变更 |
| `error` | 错误事件 |

```ts
event: async ({ event }) => {
  switch (event.type) {
    case "session.created":
      console.log("New session:", event.properties?.id)
      break
    case "error":
      console.error("Error occurred:", event.properties?.error)
      break
  }
}
```

### 4.17 config — 配置变更

```ts
config: async (config) => {
  // 配置发生变化时触发（包括插件自身的 options）
  console.log("Config:", config)
}
```

---

## 五、Auth 认证钩子

### 5.1 AuthHook 结构

```ts
auth: {
  provider: "target-provider-id",  // 如 "openai"、"github-copilot"

  // 可选：自定义加载逻辑
  loader?: async (getAuth, provider) => {
    const auth = await getAuth()   // 当前存储的认证信息
    return {
      apiKey: "...",
      // 可选：完全接管 fetch 行为（用于 token 刷新、URL 重写等）
      fetch: async (req, init) => {
        // 自定义请求逻辑
        return fetch(req, init)
      }
    }
  },

  methods: [
    // OAuth 方式 或 API Key 方式（见下文）
  ]
}
```

### 5.2 OAuth 方法

支持两种回调方式：`"auto"`（自动打开浏览器）和 `"code"`（用户手动粘贴授权码）。

```ts
{
  type: "oauth",
  label: "Login with Provider",

  // 可选：收集用户额外输入
  prompts: [
    {
      type: "text",
      key: "endpoint",
      message: "Custom endpoint URL",
      placeholder: "https://...",
      when: { key: "mode", op: "eq", value: "custom" }
    },
    {
      type: "select",
      key: "mode",
      message: "Auth mode",
      options: [
        { label: "Default", value: "default" },
        { label: "Custom endpoint", value: "custom", hint: "Use your own server" }
      ]
    }
  ],

  authorize: async (inputs) => {
    return {
      url: "https://provider.com/oauth/authorize?...",
      instructions: "Complete authorization in your browser",
      method: "auto",    // "auto" — 自动；"code" — 用户手动输入

      callback: async (code?) => {
        // 用 code 换取 token...
        return {
          type: "success",
          refresh: "refresh-token",
          access: "access-token",
          expires: Date.now() + 3600_000,
          accountId: "user-123"
          // 或 API Key 模式: key: "sk-xxx"
        }
        // 失败时返回: { type: "failed" }
      }
    }
  }
}
```

### 5.3 API Key 方法

```ts
{
  type: "api",
  label: "Enter API Key",
  prompts: [
    {
      type: "text",
      key: "apiKey",
      message: "Your API Key"
    }
  ],
  authorize: async (inputs) => {
    // 验证 key...
    if (valid) {
      return { type: "success", key: inputs.apiKey }
    }
    return { type: "failed" }
  }
}
```

### 5.4 内置认证插件

- **CodexAuthPlugin** — OpenAI Codex OAuth（浏览器 + Headless 两种）
- **CopilotAuthPlugin** — GitHub Copilot OAuth
- **GitlabAuthPlugin** — GitLab AI OAuth

---

## 六、Provider 模型提供商钩子

```ts
provider: {
  id: "my-provider",

  async models(provider, ctx) {
    // provider: 提供商基础信息
    // ctx.auth: 用户认证信息
    return {
      "my-model": {
        id: "my-model",
        api: { id: "my-model" },
        name: "My Custom Model",
        cost: {
          input: 0, output: 0,
          cache: { read: 0, write: 0 }
        },
        limit: {
          context: 200_000,
          input: 200_000,
          output: 32_000
        },
        capabilities: {
          image: false,
          tool: true,
          streaming: true
        }
      }
    }
  }
}
```

---

## 七、WorkspaceAdaptor 工作区适配器

注册自定义的工作区类型（需要 `OPENCODE_EXPERIMENTAL_WORKSPACES=true` 环境变量）。

```ts
input.experimental_workspace.register("docker", {
  name: "Docker Sandbox",
  description: "Spin up a Docker container as workspace",

  configure(config) {
    return { ...config, directory: "/workspace" }
  },

  async create(config, env, from?) {
    // 启动 Docker 容器...
  },

  async remove(config) {
    // 清理容器...
  },

  target(config) {
    return {
      type: "local",
      directory: config.directory
    }
    // 或远程: { type: "remote", url: "...", headers: {} }
  }
})
```

---

## 八、使用 SDK Client

插件注入的 `input.client` 可以调用 opencode 的完整 REST API：

```ts
export default {
  server: async (input) => {
    return {
      async event({ event }) {
        if (event.type === "session.created") {
          // 获取所有 sessions
          const { data: sessions } = await input.client.session.list()

          // 发送 prompt（流式）
          await input.client.session.prompt({
            path: { id: event.properties.id },
            body: {
              parts: [
                { type: "text", text: "请分析这个项目" }
              ]
            }
          })

          // 管理配置
          const { data: cfg } = await input.client.config.get()
          await input.client.config.update({ body: { theme: "dark" } })
        }
      }
    }
  }
}
```

---

## 九、使用 Bun Shell

`input.$` 是 Bun Shell 接口，用于在插件中执行命令：

```ts
// 简单命令
const result = await input.$`git status`.quiet()
// result.stdout: Buffer
// result.stderr: Buffer
// result.exitCode: number
// result.text(): string
// result.json(): any

// 逐行读取
const lines = await input.$`ls -la`.lines()
for await (const line of lines) {
  console.log(line)
}

// 设置工作目录和环境变量
const out = await input.$`npm test`
  .cwd(input.directory)
  .env({ NODE_ENV: "test" })
  .quiet()
```

---

## 十、完整示例

### 10.1 安全防护插件 — 阻止读取敏感文件

```ts
// 阻止 LLM 通过 Read 工具读取 .env 等敏感文件
export default {
  id: "security-guard",
  server: async () => ({
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "Read") return

      const path = output.args?.file_path ?? ""
      const blocked = [".env", ".env.local", "credentials.json", "id_rsa"]

      if (blocked.some(f => path.includes(f))) {
        throw new Error(`禁止读取敏感文件: ${path}`)
      }
    }
  })
}
```

### 10.2 环境变量注入插件

```ts
export default {
  id: "env-injector",
  server: async () => ({
    "shell.env": async (input, output) => {
      output.env["PROJECT_ROOT"] = input.cwd
      output.env["OPENCODE_SESSION"] = input.sessionID ?? ""
    }
  })
}
```

### 10.3 模型参数定制插件

```ts
export default {
  id: "model-tuner",
  server: async () => ({
    "chat.params": async (input, output) => {
      // 对特定模型调整参数
      if (input.model.providerID === "openai") {
        output.temperature = 0.3
        output.maxOutputTokens = 8000
      }
    },
    "chat.headers": async (input, output) => {
      output.headers["x-source"] = "opencode-plugin"
    }
  })
}
```

### 10.4 组合型插件

```ts
import { tool } from "@opencode-ai/plugin/tool"

export default {
  id: "productivity-kit",
  server: async (input) => {
    const startTime = Date.now()

    return {
      // 注册自定义工具
      tool: {
        get_uptime: tool({
          description: "Get the time since the plugin was loaded",
          args: {},
          async execute() {
            return `Running for ${Math.floor((Date.now() - startTime) / 1000)}s`
          }
        })
      },

      // 注入环境变量
      "shell.env": async (input, output) => {
        output.env["PLUGIN_LOADED_AT"] = String(startTime)
      },

      // 事件监听
      event: async ({ event }) => {
        if (event.type === "error") {
          console.error("[productivity-kit]", event.properties?.error)
        }
      }
    }
  }
}
```

---

## 十一、Hook 执行顺序

当多个插件注册了同一个钩子，它们按**插件加载顺序**依次执行：

```
全局配置插件 → 项目配置插件 → 全局目录插件 → 项目目录插件
```

每个钩子函数都可以修改 `output` 对象，后续插件会看到前面插件的修改。

---

## 十二、注意事项

1. **工厂函数是异步的** — 可以进行初始化工作（连接数据库、读取文件等），但加载会阻塞服务器启动
2. **Hooks 都是 async** — 可以执行异步操作，但要注意性能
3. **不要引入 `@opencode-ai/sdk`** — 类型定义用 `@opencode-ai/plugin`，SDK 客户端由运行时注入
4. **`tool.schema` 就是 Zod** — 支持 `.string()`, `.number()`, `.boolean()`, `.optional()`, `.default()`, `.describe()`, `.refine()` 等
5. **文件插件必须声明 `id`** — 在 default export 对象中显式设置
6. **npm 插件可选 `id`** — 默认使用 `package.json` 的 `name`
7. **阻塞工具执行用 `throw new Error()`** — 在 `tool.execute.before` 中抛出错误即可阻止工具实际执行
8. **敏感操作注意安全** — Shell 命令避免拼接用户输入，文件操作注意路径遍历
9. **一个包只导出一个插件类型** — 不能同时导出 `server` 和 `tui`
10. **实验性钩子需谨慎** — 以 `experimental.` 开头的钩子 API 可能在未来版本变更

---

## 十三、社区资源

| 资源 | 链接 |
|------|------|
| 官方插件文档 | https://opencode.ai/docs/plugins/ |
| 插件系统深度解析 | https://deepwiki.com/sst/opencode/7.3-plugin-system |
| workspace 插件指南 | https://gist.github.com/jlongster/2bed61c98938c67dde461bec3fc32d48 |
| ericc-ch/opencode-plugins | GitHub 上的插件 monorepo（组合、调试、通知等示例） |
| oh-my-opencode | 46 钩子的完整插件架构参考 |
| 官方内置插件源码 | `packages/opencode/src/plugin/`（Codex、Copilot、GitLab 认证） |

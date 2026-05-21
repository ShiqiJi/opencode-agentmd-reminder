import { tool } from "@opencode-ai/plugin/tool"
import type { PluginModule } from "@opencode-ai/plugin"

// ============================================================
// 插件选项类型（用户在 opencode.json 中传入的自定义参数）
// 示例配置: ["./plugins/my-plugin.ts", { "enableLogging": true }]
// ============================================================
type Options = {
  enableLogging?: boolean
}

export default {
  // npm 包可不写 id（默认用 package.json name），文件插件必须写
  id: "my-opencode-plugin",

  server: async (input, options: Options = {}) => {
    // ---- 初始化工作（连接数据库、读取配置等）----
    const startTime = Date.now()

    if (options.enableLogging) {
      console.log("[my-plugin] initialized, cwd:", input.directory)
    }

    // ---- 返回 Hooks 对象 ----
    return {
      // ========================================================
      // 4.1 tool — 注册 LLM 可调用的自定义工具
      // ========================================================
      tool: {
        // 简单工具示例
        hello: tool({
          description: "Say hello to someone",
          args: {
            name: tool.schema.string().describe("The name to greet"),
          },
          async execute(args, ctx) {
            // ctx: { sessionID, messageID, agent, directory, worktree, abort, metadata(), ask() }
            return `Hello, ${args.name}!`
          },
        }),

        // 返回结构化结果的工具
        read_project_info: tool({
          description: "Get basic info about the current project",
          args: {},
          async execute(_args, ctx) {
            const uptime = Math.floor((Date.now() - startTime) / 1000)
            return {
              title: "Project Info",
              output: [
                `Directory: ${ctx.directory}`,
                `Worktree: ${ctx.worktree}`,
                `Agent: ${ctx.agent}`,
                `Plugin uptime: ${uptime}s`,
              ].join("\n"),
              metadata: { uptime },
            }
          },
        }),

        // ---- 更多工具示例（取消注释以启用）----
        // count_files: tool({
        //   description: "Count files in a directory matching a pattern",
        //   args: {
        //     pattern: tool.schema.string().describe("Glob pattern, e.g. '**​/*.ts'"),
        //   },
        //   async execute(args, ctx) {
        //     const result = await ctx.$.$`ls ${args.pattern} | wc -l`.quiet()
        //     return `Found ${result.text().trim()} files matching "${args.pattern}"`
        //   },
        // }),
      },

      // ========================================================
      // 4.2 chat.message — 拦截用户消息（用户可见）
      // ========================================================
      "chat.message": async (_input, output) => {
        // output: { message: UserMessage, parts: Part[] }
        output.parts.push({
          type: "text",
          text: "\n[my-plugin] 插件已激活",
        })
      },

      // ========================================================
      // 4.3 chat.params — 修改 LLM 请求参数
      // ========================================================
      "chat.params": async (input, output) => {
        if (input.model.providerID === "openai") {
          output.temperature = 0.3
          output.maxOutputTokens = 8000
        }
      },

      // ========================================================
      // 4.4 chat.headers — 修改 LLM 请求头
      // ========================================================
      "chat.headers": async (_input, output) => {
        output.headers["x-plugin-source"] = "my-opencode-plugin"
      },

      // ========================================================
      // 4.5 chat.messages.transform — 变换消息历史（实验性）
      // 用户不可见，仅 LLM 收到修改
      // ========================================================
      // "experimental.chat.messages.transform": async (_input, output) => {
      //   // output.messages: Array<{ info: Message, parts: Part[] }>
      //   output.messages.unshift({
      //     info: { role: "system" },
      //     parts: [{ type: "text", text: "隐藏的系统指令" }],
      //   })
      // },

      // ========================================================
      // 4.6 chat.system.transform — 修改系统提示词（实验性）
      // ========================================================
      "experimental.chat.system.transform": async (_input, output) => {
        // output.system: string[]
        output.system.push("[my-plugin] 当前会话已激活自定义插件")
      },

      // ========================================================
      // 4.7 tool.execute.before — 工具执行前拦截
      // 可修改参数；throw Error 可阻止执行
      // ========================================================
      "tool.execute.before": async (input, output) => {
        // 阻止 LLM 读取敏感文件
        if (input.tool !== "Read") return

        const path = (output.args?.file_path as string) ?? ""
        const blocked = [".env", ".env.local", "credentials.json", "id_rsa"]

        if (blocked.some((f) => path.includes(f))) {
          throw new Error(`[my-plugin] 禁止读取敏感文件: ${path}`)
        }
      },

      // ========================================================
      // 4.8 tool.execute.after — 工具执行后处理
      // 修改结果，在 LLM 看到结果之前
      // ========================================================
      "tool.execute.after": async (input, output) => {
        // output: { title, output, metadata }
        output.output = `[executed by ${input.tool}]\n${output.output}`
      },

      // ========================================================
      // 4.9 tool.definition — 修改工具定义（实验性）
      // 修改发送给 LLM 的工具描述/参数，不改变实际实现
      // ========================================================
      // "experimental.tool.definition": async (input, output) => {
      //   // input: { toolID }
      //   output.description = "增强后的工具描述"
      //   // output.parameters = { /* 修改后的 JSON Schema */ }
      // },

      // ========================================================
      // 4.10 permission.ask — 拦截权限询问
      // ========================================================
      "permission.ask": async (input, output) => {
        // 自动允许对所有 .md 文件的读取
        if (
          input.permission === "Read" &&
          input.patterns?.every((p: string) => p.endsWith(".md"))
        ) {
          output.status = "allow" // "ask" | "allow" | "deny"
        }
      },

      // ========================================================
      // 4.11 command.execute.before — 命令执行前
      // ========================================================
      // "command.execute.before": async (input, output) => {
      //   // input: { command, sessionID, arguments }
      //   // output.parts: 可以预填充响应
      // },

      // ========================================================
      // 4.12 shell.env — 注入 Shell 环境变量
      // ========================================================
      "shell.env": async (input, output) => {
        output.env["PROJECT_ROOT"] = input.cwd
        output.env["OPENCODE_SESSION"] = input.sessionID ?? ""
      },

      // ========================================================
      // 4.13 session.compacting — 自定义压缩（实验性）
      // ========================================================
      // "experimental.session.compacting": async (_input, output) => {
      //   // 追加到默认压缩提示的上下文
      //   output.context.push("请保留所有 TODO 项")
      //   // 或完全替换压缩提示: output.prompt = "自定义的压缩提示词..."
      // },

      // ========================================================
      // 4.14 compaction.autocontinue — 控制压缩后行为（实验性）
      // ========================================================
      // "experimental.compaction.autocontinue": async (_input, output) => {
      //   output.enabled = false // 压缩后不自动继续
      // },

      // ========================================================
      // 4.15 text.complete — 自定义文本补全（实验性）
      // ========================================================
      // "experimental.text.complete": async (_input, output) => {
      //   output.text = "completion"
      // },

      // ========================================================
      // 4.16 event — 事件总线
      // 订阅 opencode 的所有系统事件
      // ========================================================
      event: async ({ event }) => {
        switch (event.type) {
          case "session.created":
            if (options.enableLogging) {
              console.log("[my-plugin] new session:", event.properties?.id)
            }
            break
          case "session.updated":
            break
          case "session.deleted":
            break
          case "message.created":
          case "message.updated":
            break
          case "shell.started":
          case "shell.completed":
            break
          case "file.watched":
          case "file.changed":
            break
          case "error":
            console.error("[my-plugin] error:", event.properties?.error)
            break
        }
      },

      // ========================================================
      // 4.17 config — 配置变更
      // ========================================================
      // config: async (config) => {
      //   console.log("[my-plugin] config changed:", config)
      // },

      // ========================================================
      // 五、Auth 认证钩子 — 接入 OAuth / API Key 认证
      // 取消注释并按需修改
      // ========================================================
      // auth: {
      //   provider: "openai", // 目标 provider ID
      //
      //   methods: [
      //     // API Key 方式
      //     {
      //       type: "api",
      //       label: "Enter API Key",
      //       prompts: [
      //         { type: "text", key: "apiKey", message: "Your API Key" },
      //       ],
      //       authorize: async (inputs) => {
      //         // 验证 API Key...
      //         if (inputs.apiKey) {
      //           return { type: "success", key: inputs.apiKey as string }
      //         }
      //         return { type: "failed" }
      //       },
      //     },
      //
      //     // OAuth 方式
      //     // {
      //     //   type: "oauth",
      //     //   label: "Login with Provider",
      //     //   authorize: async (inputs) => ({
      //     //     url: "https://provider.com/oauth/authorize?...",
      //     //     instructions: "Complete authorization in your browser",
      //     //     method: "auto", // "auto" = 自动打开浏览器; "code" = 用户手动粘贴
      //     //     callback: async (code?) => {
      //     //       // 用 code 换取 token...
      //     //       return {
      //     //         type: "success",
      //     //         refresh: "refresh-token",
      //     //         access: "access-token",
      //     //         expires: Date.now() + 3600_000,
      //     //         accountId: "user-123",
      //     //       }
      //     //     },
      //     //   }),
      //     // },
      //   ],
      // },

      // ========================================================
      // 六、Provider 模型提供商钩子
      // ========================================================
      // provider: {
      //   id: "my-provider",
      //   async models(_provider, _ctx) {
      //     return {
      //       "my-model": {
      //         id: "my-model",
      //         api: { id: "my-model" },
      //         name: "My Custom Model",
      //         cost: {
      //           input: 0, output: 0,
      //           cache: { read: 0, write: 0 },
      //         },
      //         limit: { context: 200_000, input: 200_000, output: 32_000 },
      //         capabilities: { image: false, tool: true, streaming: true },
      //       },
      //     }
      //   },
      // },
    }
  },
} satisfies PluginModule

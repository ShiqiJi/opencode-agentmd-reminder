import type { PluginModule } from "@opencode-ai/plugin"

const REMINDER = `Remember to check if any changes need to be synced to AGENT.md, and whether any information from the conversation is worth persisting to AGENT.md (e.g., project conventions, architectural decisions, key files/patterns). Update AGENT.md if necessary.`

export default {
  id: "agentmd-reminder",

  server: async () => {
    return {
      "experimental.chat.system.transform": async (_input, output) => {
        output.system.push(REMINDER)
      },
    }
  },
} satisfies PluginModule
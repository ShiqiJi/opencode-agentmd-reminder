# agentmd-reminder

OpenCode Server plugin — reminds the LLM to check and update AGENT.md with important information from the conversation.

## Features

- Injects reminder text into the LLM system prompt via the `chat.system.transform` hook
- Invisible to users; only the LLM receives the instruction
- Reminds the LLM to check whether project conventions, architectural decisions, key context, etc. from the conversation should be persisted to AGENT.md

## Installation

- Copy this plugin into your OpenCode plugins directory;

- You can also reference the GitHub repository directly:

```json
{
  // .config/opencode/opencode.json
  "plugin": ["github:ShiqiJi/opencode-agentmd-reminder"]
}
```

## Configuration

Declare in `opencode.json`:

```json
{
  "plugin": ["./path/to/agentmd-reminder"]
}
```

## Development

```bash
npm install
npm run typecheck
```

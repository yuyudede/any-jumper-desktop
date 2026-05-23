# Any Jumper Desktop

Electron + React + TypeScript desktop app for Any Jumper workflows and AI agent sessions.

## Local Development

```bash
pnpm install
pnpm dev
```

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm dist
```

## Architecture

- `src/`: React renderer UI.
- `electron/`: Electron main process, preload bridge, SQLite storage, tools, Git, MCP, and official DeepAgents runtime.
- `resources/icons/`: Electron app icons.

The renderer talks to the trusted main process through `window.anyJumper`. API keys and X-Tokens are encrypted by the Electron main process and are not exposed to renderer state.
# any-jumper-desktop

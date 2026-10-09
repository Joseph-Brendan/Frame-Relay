# Privacy

Frame-Relay collects nothing. There is no telemetry, no analytics, no accounts and no crash
reporting. We do not know who uses Frame-Relay, and we like it that way.

## What runs on your machine

Everything Frame-Relay does happens on your own computer:

- The **Figma plugin** reads the design file you have open and exports it to files you download.
- The **CLI** reads your local kit folder and writes local files into your project.
- The **MCP server** reads your local kit and answers your AI tool's questions over a local
  connection (stdio, which means the AI tool starts it as a child program).
- The **live bridge** runs a WebSocket server on `127.0.0.1`, your own machine. Only the Figma
  plugin talks to it.

## What leaves your machine

Nothing. Frame-Relay does not send your designs, code, tokens or usage data to any server we run.
We do not have a server.

Two normal exceptions, both outside our control:

- Your AI tool may send its own requests to its model provider, exactly as it does without
  Frame-Relay. That is between you and your tool.
- `npm install` and `npx` contact the npm registry to download packages. That is npm's normal
  behavior, not Frame-Relay telemetry.

## What is stored on disk

Frame-Relay writes files into your project when you run commands:

- The exported kit folder, for example `frame-relay-kit/`
- Generated components, token CSS and rule files
- MCP client configs such as `opencode.json` and `.mcp.json`
- `.frame-relay/lock.json`, which tracks file fingerprints for safe re-syncs
- `.frame-relay/live.json`, only while live mode is running. It stores the port, the pairing code,
  the code expiry, the paired flag and the start time. It is deleted when live mode stops, and
  `sync` adds it to `.gitignore`.

None of these files are uploaded anywhere by Frame-Relay.

## Figma plugin network access

The plugin manifest allows connections to `ws://localhost:47321`, `ws://localhost:47322` and
`ws://localhost:47323` for live mode. The plugin does not connect anywhere else.

## Questions

Open an issue at https://github.com/Joseph-Brendan/Frame-Relay/issues or reach the maintainer
through GitHub at https://github.com/Joseph-Brendan.

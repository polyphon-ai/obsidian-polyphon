# Polyphon for Obsidian

An Obsidian plugin that connects to a running [Polyphon](https://polyphon.ai) instance, letting you have multi-voice AI conversations from within your vault.

## Requirements

- [Polyphon](https://github.com/polyphon-ai/polyphon) must be running locally (or accessible on your network)
- Obsidian desktop — mobile is not supported

## Installation

1. Run `npm run build` to produce `main.js`
2. Copy `main.js`, `manifest.json`, and `styles.css` to:
   ```
   <vault>/.obsidian/plugins/polyphon/
   ```
3. Enable the plugin in **Settings → Community Plugins**
4. Open the Polyphon sidebar from the ribbon icon or command palette

## Configuration

Open **Settings → Polyphon** to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| Host | `127.0.0.1` | Hostname or IP of your Polyphon instance |
| Port | `51234` | TCP port Polyphon is listening on |
| API token | _(blank)_ | Token from Polyphon's API settings |
| Persist conversations | Off | Save and restore history across restarts |
| Debug mode | Off | Log raw JSON-RPC frames to the console |

## Usage

1. Start Polyphon
2. Open the sidebar (ribbon icon or `Cmd/Ctrl+P → Polyphon: Open sidebar`)
3. Select a composition from the dropdown
4. Type a message and press **Send** or `Cmd/Ctrl+Enter`

Each voice in the composition responds in the unified thread, labeled by name.

## Development

```sh
npm install
npm run dev    # watch mode — auto-copies to vault/.obsidian/plugins/polyphon/ if present
npm run build  # production build
npm test       # run tests
```

## License

MIT

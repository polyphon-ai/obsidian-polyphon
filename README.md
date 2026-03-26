# Polyphon for Obsidian

An Obsidian plugin that connects to a running [Polyphon](https://polyphon.ai) instance, letting you have multi-voice AI conversations from within your vault.

## Requirements

- [Polyphon](https://polyphon.ai) must be installed and running locally (desktop app)
- Obsidian desktop — mobile is not supported

## Installation

### Community plugin directory (recommended)

1. Open **Settings → Community plugins → Browse**
2. Search for **Polyphon**
3. Click **Install**, then **Enable**

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](../../releases/latest)
2. Copy them to `<vault>/.obsidian/plugins/polyphon/`
3. Enable the plugin in **Settings → Community plugins**

### BRAT (beta)

Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) and add `polyphon-ai/obsidian-polyphon`.

## Configuration

Open **Settings → Polyphon** after enabling the plugin:

| Setting | Default | Description |
|---------|---------|-------------|
| Host | `127.0.0.1` | Hostname or IP of your Polyphon instance |
| Port | `7432` | TCP port Polyphon is listening on |
| API token | *(auto)* | Use **Read local token** to load from the running instance, or paste manually |
| Persist conversations | Off | Save and restore history across restarts |
| Debug mode | Off | Log raw JSON-RPC frames to the console |

The API token is stored at `~/Library/Application Support/Polyphon/api.key` on macOS. The **Read local token** button in settings loads it automatically.

## Usage

1. Start Polyphon
2. Open the sidebar — click the message icon in the ribbon, or use `Cmd/Ctrl+P → Polyphon: Open sidebar`
3. The plugin connects automatically; the status badge shows **online** when ready
4. Select a composition from the dropdown
5. Choose or create a session
6. Type a message and press **Send** or `Enter`

Each voice in the composition responds in the unified thread, labeled by name. Use `@VoiceName` to target a specific voice.

### Voice targeting

Type `@` in the message field to see a dropdown of voices. Select one to direct your message to that voice only.

### Session context

The plugin automatically includes your current open file path in the first message of each session, giving the AI voices context about what you're working on.

## Development

```sh
npm install
npm run dev    # watch mode — auto-copies to vault/.obsidian/plugins/polyphon/
npm run build  # production build
npm test       # unit + integration tests
npm run lint   # ESLint
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on the test suite and architecture.

## License

MIT — see [LICENSE](LICENSE)

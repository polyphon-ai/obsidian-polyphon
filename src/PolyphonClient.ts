import { EventEmitter } from "events";
import * as net from "net";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type {
  Composition,
  JsonRpcError,
  JsonRpcResponse,
  Message,
  PolyphonConnectionConfig,
  Session,
  StreamChunkNotification,
} from "./types";

export type StreamChunkHandler = (params: StreamChunkNotification["params"]) => void;

// Returns the default path to Polyphon's api.key file on the local machine.
// Mirrors the logic in polyphon/packages/poly/src/connect.ts :: localTokenPath()
export function defaultTokenPath(): string {
  const dataDir = process.env.POLYPHON_DATA_DIR ?? defaultUserDataPath();
  return path.join(dataDir, "api.key");
}

function defaultUserDataPath(): string {
  const platform = os.platform();
  const appName = "Polyphon";
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", appName);
  } else if (platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, appName);
  } else {
    const xdgConfig = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
    return path.join(xdgConfig, appName);
  }
}

export function readLocalToken(): string {
  const tokenPath = defaultTokenPath();
  const content = fs.readFileSync(tokenPath, "utf-8").trim();
  if (!content) throw new Error("api.key is empty");
  return content;
}

// NOTE: This class is intentionally free of Obsidian imports.
// It is the seed of a future @polyphon-ai/client SDK package.
export class PolyphonClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buffer = "";
  private pending = new Map<
    number | string,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      onChunk?: StreamChunkHandler;
    }
  >();
  private nextId = 1;
  private config: PolyphonConnectionConfig;

  constructor(config: PolyphonConnectionConfig) {
    super();
    this.config = config;
  }

  // ---- Connection lifecycle ----

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();

      this.socket.on("connect", () => {
        this.authenticate()
          .then(() => resolve())
          .catch(reject);
      });

      this.socket.on("data", (data) => this.onData(data.toString()));
      this.socket.on("close", () => this.emit("disconnect"));
      this.socket.on("error", (err) => {
        this.emit("error", err);
        reject(err);
      });

      this.socket.connect(this.config.port, this.config.host);
    });
  }

  disconnect(): void {
    this.socket?.destroy();
    this.socket = null;
    this.buffer = "";
    this.pending.clear();
  }

  get isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  // ---- API methods ----

  async compositions(): Promise<Composition[]> {
    return this.call<Composition[]>("compositions.list", {});
  }

  async getComposition(id: string): Promise<Composition> {
    return this.call<Composition>("compositions.get", { id });
  }

  async createSession(compositionId: string, name?: string): Promise<Session> {
    return this.call<Session>("sessions.create", { compositionId, name });
  }

  async getSession(id: string): Promise<Session> {
    return this.call<Session>("sessions.get", { id });
  }

  async sessionMessages(sessionId: string): Promise<Message[]> {
    return this.call<Message[]>("sessions.messages", { sessionId });
  }

  // Streams chunks via onChunk callback (correlated by requestId).
  // Returns all messages (conductor + voice responses) once complete.
  async broadcast(
    sessionId: string,
    content: string,
    onChunk?: StreamChunkHandler,
  ): Promise<Message[]> {
    const result = await this.callStreaming<{ messages: Message[] }>(
      "voice.broadcast",
      { sessionId, content, stream: true },
      onChunk,
    );
    return result.messages;
  }

  async exportSession(sessionId: string, format: "markdown" | "json" | "plaintext"): Promise<string> {
    const result = await this.call<{ content: string }>("sessions.export", { sessionId, format });
    return result.content;
  }

  // ---- Internals ----

  private async authenticate(): Promise<void> {
    await this.call<{ ok: boolean }>("api.authenticate", { token: this.config.token });
  }

  private call<T>(method: string, params: unknown): Promise<T> {
    return this.callStreaming<T>(method, params as Record<string, unknown>);
  }

  private callStreaming<T>(
    method: string,
    params: Record<string, unknown>,
    onChunk?: StreamChunkHandler,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        onChunk,
      });
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      this.socket?.write(msg + "\n");
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as JsonRpcResponse | StreamChunkNotification;
        if ("method" in msg && msg.method === "stream.chunk") {
          const notification = msg as StreamChunkNotification;
          // Route chunk to the specific pending call via requestId correlation
          const reqId = notification.params?.requestId;
          const pending = this.pending.get(reqId);
          if (pending?.onChunk) {
            pending.onChunk(notification.params);
          }
        } else {
          const res = msg as JsonRpcResponse;
          const pending = this.pending.get(res.id);
          if (!pending) continue;
          this.pending.delete(res.id);
          if (res.error) {
            const err = new Error((res.error as JsonRpcError).message);
            (err as any).code = (res.error as JsonRpcError).code;
            pending.reject(err);
          } else {
            pending.resolve(res.result);
          }
        }
      } catch {
        // malformed line — ignore
      }
    }
  }
}

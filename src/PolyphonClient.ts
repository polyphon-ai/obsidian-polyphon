import { EventEmitter } from "events";
import * as net from "net";
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

// NOTE: This class is intentionally free of Obsidian imports.
// It is the seed of a future @polyphon-ai/client SDK package.
export class PolyphonClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buffer = "";
  private pending = new Map<number | string, { resolve: (v: unknown) => void; reject: (e: JsonRpcError) => void }>();
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
    const result = await this.call<{ compositions: Composition[] }>("compositions.list", {});
    return result.compositions;
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
    const result = await this.call<{ messages: Message[] }>("sessions.messages", { sessionId });
    return result.messages;
  }

  async broadcast(sessionId: string, content: string, stream = true): Promise<Message[]> {
    const result = await this.call<{ messages: Message[] }>("voice.broadcast", { sessionId, content, stream });
    return result.messages;
  }

  async exportSession(sessionId: string, format: "markdown" | "json" | "plaintext"): Promise<string> {
    const result = await this.call<{ content: string }>("sessions.export", { sessionId, format });
    return result.content;
  }

  onStreamChunk(handler: StreamChunkHandler): void {
    this.on("stream.chunk", handler);
  }

  offStreamChunk(handler: StreamChunkHandler): void {
    this.off("stream.chunk", handler);
  }

  // ---- Internals ----

  private async authenticate(): Promise<void> {
    await this.call<{ ok: boolean }>("api.authenticate", { token: this.config.token });
  }

  private call<T>(method: string, params: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
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
          this.emit("stream.chunk", (msg as StreamChunkNotification).params);
        } else {
          const res = msg as JsonRpcResponse;
          const pending = this.pending.get(res.id);
          if (!pending) continue;
          this.pending.delete(res.id);
          if (res.error) pending.reject(res.error);
          else pending.resolve(res.result);
        }
      } catch {
        // malformed line — ignore
      }
    }
  }
}

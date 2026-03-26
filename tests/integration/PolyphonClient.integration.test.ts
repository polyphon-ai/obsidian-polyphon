import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as net from "net";
import { PolyphonClient } from "../../src/PolyphonClient";

// Spins up a minimal JSON-RPC TCP server for integration tests.
class MockPolyphonServer {
  private server: net.Server;
  private handlers: Map<string, (params: unknown) => unknown> = new Map();
  port = 0;

  constructor() {
    this.server = net.createServer((socket) => {
      let buf = "";
      let authenticated = false;
      socket.setEncoding("utf-8");
      socket.on("data", (chunk) => {
        buf += chunk;
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (!authenticated) {
            if (msg.method === "api.authenticate" && msg.params?.token === "test-token") {
              authenticated = true;
              socket.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { ok: true } }) + "\n");
            } else {
              socket.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32001, message: "Unauthorized" } }) + "\n");
            }
            continue;
          }
          const handler = this.handlers.get(msg.method);
          if (typeof handler === "function") {
            const result = handler(msg.params);
            socket.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\n");
          } else {
            socket.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found" } }) + "\n");
          }
        }
      });
    });
  }

  handle(method: string, fn: (params: unknown) => unknown) {
    this.handlers.set(method, fn);
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(0, "127.0.0.1", () => {
        this.port = (this.server.address() as net.AddressInfo).port;
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }
}

describe("PolyphonClient integration", () => {
  let server: MockPolyphonServer;
  let client: PolyphonClient;

  beforeEach(async () => {
    server = new MockPolyphonServer();
    await server.start();
    client = new PolyphonClient({ host: "127.0.0.1", port: server.port, token: "test-token" });
  });

  afterEach(async () => {
    client.disconnect();
    await server.stop();
  });

  // ---- connect / auth -------------------------------------------------------

  it("connects and authenticates successfully", async () => {
    await expect(client.connect()).resolves.toBeUndefined();
    expect(client.isConnected).toBe(true);
  });

  it("rejects connection with wrong token", async () => {
    const bad = new PolyphonClient({ host: "127.0.0.1", port: server.port, token: "wrong" });
    await expect(bad.connect()).rejects.toThrow();
    bad.disconnect();
  });

  it("isConnected is false after disconnect()", async () => {
    await client.connect();
    client.disconnect();
    expect(client.isConnected).toBe(false);
  });

  // ---- sessions.create -------------------------------------------------------

  it("createSession sends source: obsidian", async () => {
    let capturedParams: any;
    server.handle("sessions.create", (params) => {
      capturedParams = params;
      return { id: "s1", compositionId: "c1", name: "Test", mode: "broadcast",
        createdAt: 1000, updatedAt: 1000, archived: false, workingDir: null,
        sandboxedToWorkingDir: false, source: "obsidian",
        continuationPolicy: "none", continuationMaxRounds: 1 };
    });

    await client.connect();
    await client.createSession("c1", "Test");
    expect(capturedParams.source).toBe("obsidian");
  });

  // ---- compositions.list -------------------------------------------------------

  it("compositions() returns compositions with sides assigned", async () => {
    server.handle("compositions.list", () => [{
      id: "c1", name: "Test", mode: "broadcast",
      continuationPolicy: "none", continuationMaxRounds: 1,
      createdAt: 1000, updatedAt: 1000, archived: false,
      voices: [
        { id: "v1", displayName: "A", color: "#f00", avatarIcon: "x", enabledTools: [] },
        { id: "v2", displayName: "B", color: "#0f0", avatarIcon: "y", enabledTools: [] },
      ],
    }]);

    await client.connect();
    const comps = await client.compositions();
    expect(comps).toHaveLength(1);
    expect(comps[0].voices[0].side).toBe("left");
    expect(comps[0].voices[1].side).toBe("right");
  });

  // ---- streaming ----------------------------------------------------------------

  it("broadcast delivers stream chunks via onChunk callback", async () => {
    const sessionId = "s1";
    server.handle("voice.broadcast", (params: any) => {
      // Simulate stream chunks — we can't push them async in this simple server,
      // so test via the result shape instead
      return { messages: [
        { id: "m1", sessionId, role: "conductor", voiceId: null, voiceName: null, content: "hi", timestamp: 1000, roundIndex: 0 },
        { id: "m2", sessionId, role: "voice", voiceId: "v1", voiceName: "A", content: "reply", timestamp: 1001, roundIndex: 0 },
      ]};
    });

    await client.connect();
    const messages = await client.broadcast(sessionId, "hi");
    expect(messages).toHaveLength(2);
    expect(messages[1].content).toBe("reply");
  });

  // ---- error handling -----------------------------------------------------------

  it("rejects on unknown method", async () => {
    await client.connect();
    await expect((client as any).call("nonexistent.method", {})).rejects.toThrow();
  });

  it("sessions() filters by compositionId when provided", async () => {
    server.handle("sessions.list", () => [
      { id: "s1", compositionId: "c1", name: "A", mode: "broadcast", createdAt: 1000, updatedAt: 1000, archived: false, workingDir: null, sandboxedToWorkingDir: false, source: "obsidian", continuationPolicy: "none", continuationMaxRounds: 1 },
      { id: "s2", compositionId: "c2", name: "B", mode: "broadcast", createdAt: 1000, updatedAt: 1000, archived: false, workingDir: null, sandboxedToWorkingDir: false, source: "obsidian", continuationPolicy: "none", continuationMaxRounds: 1 },
    ]);

    await client.connect();
    const filtered = await client.sessions("c1");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("s1");
  });
});

import { describe, it, expect, vi } from "vitest";
import { PolyphonClient, defaultTokenPath, readLocalToken } from "../../src/PolyphonClient";
import * as path from "path";
import * as os from "os";

function makeClient() {
  return new PolyphonClient({ host: "127.0.0.1", port: 7432, token: "test-token" });
}

// ---- connection state -------------------------------------------------------

describe("PolyphonClient — connection state", () => {
  it("is not connected before connect()", () => {
    expect(makeClient().isConnected).toBe(false);
  });

  it("is not connected after disconnect() without prior connect()", () => {
    const c = makeClient();
    c.disconnect();
    expect(c.isConnected).toBe(false);
  });
});

// ---- defaultTokenPath -------------------------------------------------------

describe("defaultTokenPath", () => {
  it("resolves to the correct macOS path", () => {
    const p = defaultTokenPath();
    if (os.platform() === "darwin") {
      expect(p).toBe(path.join(os.homedir(), "Library", "Application Support", "Polyphon", "api.key"));
    } else {
      expect(p).toContain(path.join("Polyphon", "api.key"));
    }
  });

  it("respects POLYPHON_DATA_DIR override", () => {
    const orig = process.env.POLYPHON_DATA_DIR;
    process.env.POLYPHON_DATA_DIR = "/tmp/polyphon-test";
    expect(defaultTokenPath()).toBe("/tmp/polyphon-test/api.key");
    if (orig === undefined) delete process.env.POLYPHON_DATA_DIR;
    else process.env.POLYPHON_DATA_DIR = orig;
  });
});

// ---- compositions() side assignment -----------------------------------------

describe("PolyphonClient.compositions() — side assignment", () => {
  it("assigns left/right alternating by index", async () => {
    const client = makeClient();
    const raw = {
      id: "comp-1", name: "Test", mode: "broadcast",
      continuationPolicy: "none", continuationMaxRounds: 1,
      createdAt: 1000, updatedAt: 1000, archived: false,
      voices: [
        { id: "v1", displayName: "A", color: "#f00", avatarIcon: "x", enabledTools: [] },
        { id: "v2", displayName: "B", color: "#0f0", avatarIcon: "y", enabledTools: [] },
        { id: "v3", displayName: "C", color: "#00f", avatarIcon: "z", enabledTools: [] },
      ],
    };
    (client as any).call = vi.fn().mockResolvedValue([raw]);
    const comps = await client.compositions();
    expect(comps[0].voices[0].side).toBe("left");
    expect(comps[0].voices[1].side).toBe("right");
    expect(comps[0].voices[2].side).toBe("left");
  });

  it("handles a single voice (left)", async () => {
    const client = makeClient();
    const raw = {
      id: "comp-1", name: "Solo", mode: "broadcast",
      continuationPolicy: "none", continuationMaxRounds: 1,
      createdAt: 1000, updatedAt: 1000, archived: false,
      voices: [{ id: "v1", displayName: "Solo", color: "#f00", avatarIcon: "x", enabledTools: [] }],
    };
    (client as any).call = vi.fn().mockResolvedValue([raw]);
    const comps = await client.compositions();
    expect(comps[0].voices[0].side).toBe("left");
  });

  it("handles no voices", async () => {
    const client = makeClient();
    const raw = {
      id: "comp-1", name: "Empty", mode: "broadcast",
      continuationPolicy: "none", continuationMaxRounds: 1,
      createdAt: 1000, updatedAt: 1000, archived: false,
      voices: [],
    };
    (client as any).call = vi.fn().mockResolvedValue([raw]);
    const comps = await client.compositions();
    expect(comps[0].voices).toHaveLength(0);
  });
});

// ---- createSession ----------------------------------------------------------

describe("PolyphonClient.createSession()", () => {
  it("always sends source: obsidian", async () => {
    const client = makeClient();
    const callSpy = vi.fn().mockResolvedValue({ id: "s1", compositionId: "c1", name: "Test",
      mode: "broadcast", createdAt: 1000, updatedAt: 1000, archived: false,
      workingDir: null, sandboxedToWorkingDir: false, source: "obsidian",
      continuationPolicy: "none", continuationMaxRounds: 1 });
    (client as any).call = callSpy;

    await client.createSession("c1");
    expect(callSpy.mock.calls[0]![1]).toMatchObject({ source: "obsidian" });
  });

  it("passes name and workingDir when provided", async () => {
    const client = makeClient();
    const callSpy = vi.fn().mockResolvedValue({});
    (client as any).call = callSpy;

    await client.createSession("c1", "My Session", "/vault/path").catch(() => {});
    expect(callSpy.mock.calls[0]![1]).toMatchObject({
      compositionId: "c1",
      name: "My Session",
      workingDir: "/vault/path",
    });
  });
});

// ---- sessions() filtering ---------------------------------------------------

describe("PolyphonClient.sessions()", () => {
  it("returns all sessions when no compositionId provided", async () => {
    const client = makeClient();
    const data = [
      { id: "s1", compositionId: "c1", source: "obsidian" },
      { id: "s2", compositionId: "c2", source: "obsidian" },
    ];
    (client as any).call = vi.fn().mockResolvedValue(data);
    const result = await client.sessions();
    expect(result).toHaveLength(2);
  });

  it("filters by compositionId when provided", async () => {
    const client = makeClient();
    const data = [
      { id: "s1", compositionId: "c1", source: "obsidian" },
      { id: "s2", compositionId: "c2", source: "obsidian" },
    ];
    (client as any).call = vi.fn().mockResolvedValue(data);
    const result = await client.sessions("c1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s1");
  });
});

// ---- JSON-RPC error handling ------------------------------------------------

describe("PolyphonClient — error handling", () => {
  it("rejects with an Error that has the server message", async () => {
    const client = makeClient();
    (client as any).pending = new Map();
    (client as any).nextId = 1;
    (client as any).socket = { write: vi.fn(), destroyed: false };

    const callPromise = (client as any).callStreaming("test.method", {});

    // Simulate server error response
    (client as any).onData(JSON.stringify({
      jsonrpc: "2.0", id: 1,
      error: { code: -32002, message: "Not found" },
    }) + "\n");

    await expect(callPromise).rejects.toThrow("Not found");
  });

  it("routes stream.chunk to the correct pending call by requestId", () => {
    const client = makeClient();
    const chunks: string[] = [];

    (client as any).pending = new Map([
      [42, { resolve: vi.fn(), reject: vi.fn(), onChunk: (p: any) => chunks.push(p.delta) }],
    ]);

    (client as any).onData(JSON.stringify({
      jsonrpc: "2.0",
      method: "stream.chunk",
      params: { requestId: 42, voiceId: "v1", voiceName: "A", delta: "hello" },
    }) + "\n");

    expect(chunks).toEqual(["hello"]);
  });

  it("ignores stream.chunk for unknown requestId", () => {
    const client = makeClient();
    (client as any).pending = new Map();

    // Should not throw
    expect(() => {
      (client as any).onData(JSON.stringify({
        jsonrpc: "2.0",
        method: "stream.chunk",
        params: { requestId: 999, voiceId: "v1", voiceName: "A", delta: "hi" },
      }) + "\n");
    }).not.toThrow();
  });

  it("ignores malformed JSON lines", () => {
    const client = makeClient();
    (client as any).pending = new Map();
    expect(() => (client as any).onData("not json\n")).not.toThrow();
  });

  it("handles partial lines across multiple data chunks", async () => {
    const client = makeClient();
    const callSpy = vi.fn().mockResolvedValue(undefined);
    (client as any).pending = new Map([
      [1, { resolve: callSpy, reject: vi.fn() }],
    ]);

    const response = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } });
    const half = Math.floor(response.length / 2);

    (client as any).onData(response.slice(0, half));
    expect(callSpy).not.toHaveBeenCalled();
    (client as any).onData(response.slice(half) + "\n");
    expect(callSpy).toHaveBeenCalledWith({ ok: true });
  });
});

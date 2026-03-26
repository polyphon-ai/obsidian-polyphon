import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { PolyphonClient } from "../../src/PolyphonClient";
import { startMockPolyphonServer, type MockServer } from "../helpers/mockPolyphonServer";

describe("PolyphonClient integration", () => {
  let server: MockServer;
  let client: PolyphonClient;

  beforeAll(async () => {
    server = await startMockPolyphonServer();
    client = new PolyphonClient({ host: "127.0.0.1", port: server.port, token: server.token });
    await client.connect();
  });

  afterEach(() => {
    server.setBroadcastChunks([]);
  });

  afterAll(async () => {
    client.disconnect();
    await server.close();
  });

  // ---- Connection ----

  it("is connected after connect()", () => {
    expect(client.isConnected).toBe(true);
  });

  it("rejects with invalid token", async () => {
    const bad = new PolyphonClient({ host: "127.0.0.1", port: server.port, token: "wrong" });
    await expect(bad.connect()).rejects.toThrow();
  });

  // ---- compositions ----

  it("lists compositions and assigns sides", async () => {
    const comps = await client.compositions();
    expect(comps.length).toBeGreaterThan(0);
    expect(comps[0].voices[0].side).toBe("left");
    expect(comps[0].voices[1].side).toBe("right");
  });

  // ---- sessions ----

  it("creates a session", async () => {
    const comps = await client.compositions();
    const session = await client.createSession(comps[0].id, "Test Session");
    expect(session.id).toBeTruthy();
    expect(session.compositionId).toBe(comps[0].id);
    expect(session.name).toBe("Test Session");
    expect(server.requestCount("sessions.create")).toBeGreaterThan(0);
  });

  it("lists sessions after creating one", async () => {
    const comps = await client.compositions();
    await client.createSession(comps[0].id, "Listed Session");
    const sessions = await client.sessions();
    expect(sessions.some((s) => s.name === "Listed Session")).toBe(true);
  });

  it("filters sessions by compositionId", async () => {
    const comps = await client.compositions();
    const sessions = await client.sessions(comps[0].id);
    expect(sessions.every((s) => s.compositionId === comps[0].id)).toBe(true);
  });

  it("gets session by id", async () => {
    const comps = await client.compositions();
    const created = await client.createSession(comps[0].id, "Get Me");
    const fetched = await client.getSession(created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.name).toBe("Get Me");
  });

  it("lists session messages (empty for new session)", async () => {
    const comps = await client.compositions();
    const session = await client.createSession(comps[0].id);
    const messages = await client.sessionMessages(session.id);
    expect(Array.isArray(messages)).toBe(true);
  });

  it("passes workingDir when creating a session", async () => {
    const comps = await client.compositions();
    const session = await client.createSession(comps[0].id, "WD Test", "/tmp/vault");
    expect(session.workingDir).toBe("/tmp/vault");
  });

  // ---- broadcast ----

  it("broadcasts and receives messages", async () => {
    const comps = await client.compositions();
    const session = await client.createSession(comps[0].id);
    const messages = await client.broadcast(session.id, "Hello");
    expect(messages.length).toBeGreaterThan(0);
    expect(server.requestCount("voice.broadcast")).toBeGreaterThan(0);
  });

  it("receives stream chunks via onChunk callback", async () => {
    server.setBroadcastChunks([[
      { voiceId: "voice-1", voiceName: "Anthropic", delta: "Hello " },
      { voiceId: "voice-1", voiceName: "Anthropic", delta: "world" },
    ]]);

    const comps = await client.compositions();
    const session = await client.createSession(comps[0].id);
    const received: string[] = [];
    await client.broadcast(session.id, "Hi", (params) => {
      received.push(params.delta);
    });
    expect(received).toEqual(["Hello ", "world"]);
  });

  it("routes stream chunks by requestId", async () => {
    server.setBroadcastChunks([[
      { voiceId: "voice-1", voiceName: "Anthropic", delta: "A" },
      { voiceId: "voice-2", voiceName: "OpenAI", delta: "B" },
    ]]);

    const comps = await client.compositions();
    const session = await client.createSession(comps[0].id);
    const byVoice: Record<string, string> = {};
    await client.broadcast(session.id, "Multi", (params) => {
      byVoice[params.voiceId] = (byVoice[params.voiceId] ?? "") + params.delta;
    });
    expect(byVoice["voice-1"]).toBe("A");
    expect(byVoice["voice-2"]).toBe("B");
  });

  // ---- settings.getUserProfile ----

  it("fetches user profile", async () => {
    const profile = await client.getUserProfile();
    expect(profile.conductorName).toBeTruthy();
    expect(typeof profile.conductorColor).toBe("string");
  });

  // ---- sessions.export ----

  it("exports a session", async () => {
    const comps = await client.compositions();
    const session = await client.createSession(comps[0].id);
    const content = await client.exportSession(session.id, "markdown");
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
  });
});

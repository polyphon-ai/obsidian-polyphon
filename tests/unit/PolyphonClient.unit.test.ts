import { describe, it, expect } from "vitest";
import { PolyphonClient } from "../../src/PolyphonClient";

describe("PolyphonClient", () => {
  it("is not connected before connect() is called", () => {
    const client = new PolyphonClient({ host: "127.0.0.1", port: 51234, token: "" });
    expect(client.isConnected).toBe(false);
  });

  it("is not connected after disconnect() is called without prior connect()", () => {
    const client = new PolyphonClient({ host: "127.0.0.1", port: 51234, token: "" });
    client.disconnect();
    expect(client.isConnected).toBe(false);
  });
});

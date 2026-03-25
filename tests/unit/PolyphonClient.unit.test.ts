import { describe, it, expect, vi } from "vitest";
import { PolyphonClient, defaultTokenPath, readLocalToken } from "../../src/PolyphonClient";
import * as path from "path";
import * as os from "os";

describe("PolyphonClient", () => {
  it("is not connected before connect() is called", () => {
    const client = new PolyphonClient({ host: "127.0.0.1", port: 7432, token: "" });
    expect(client.isConnected).toBe(false);
  });

  it("is not connected after disconnect() is called without prior connect()", () => {
    const client = new PolyphonClient({ host: "127.0.0.1", port: 7432, token: "" });
    client.disconnect();
    expect(client.isConnected).toBe(false);
  });
});

describe("defaultTokenPath", () => {
  it("resolves to the correct path on the current platform", () => {
    const tokenPath = defaultTokenPath();
    const platform = os.platform();
    if (platform === "darwin") {
      expect(tokenPath).toBe(
        path.join(os.homedir(), "Library", "Application Support", "Polyphon", "api.key")
      );
    } else if (platform === "win32") {
      expect(tokenPath).toContain(path.join("Polyphon", "api.key"));
    } else {
      expect(tokenPath).toContain(path.join("Polyphon", "api.key"));
    }
  });

  it("respects POLYPHON_DATA_DIR env override", () => {
    const original = process.env.POLYPHON_DATA_DIR;
    process.env.POLYPHON_DATA_DIR = "/tmp/polyphon-test";
    expect(defaultTokenPath()).toBe("/tmp/polyphon-test/api.key");
    if (original === undefined) delete process.env.POLYPHON_DATA_DIR;
    else process.env.POLYPHON_DATA_DIR = original;
  });
});

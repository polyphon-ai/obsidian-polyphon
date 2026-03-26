import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: resolve(__dirname, "tests/helpers/obsidianStub.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.unit.test.ts"],
    setupFiles: ["tests/helpers/obsidianDomPolyfill.ts"],
    pool: "vmThreads",
  },
});

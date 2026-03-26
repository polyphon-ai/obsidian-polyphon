import { describe, it, expect } from "vitest";
import { parseMention } from "../../src/parseMention";
import type { Voice } from "../../src/types";

function makeVoice(displayName: string, id = displayName.toLowerCase()): Voice {
  return { id, displayName, color: "#fff", avatarIcon: "", side: "left" };
}

const voices = [
  makeVoice("Anthropic"),
  makeVoice("OpenAI"),
  makeVoice("Gemini"),
];

describe("parseMention", () => {
  it("returns null when no mention present", () => {
    expect(parseMention("Hello world", voices)).toBeNull();
  });

  it("matches @Name at start of string", () => {
    expect(parseMention("@Anthropic hello", voices)?.displayName).toBe("Anthropic");
  });

  it("matches @Name after whitespace", () => {
    expect(parseMention("Hey @OpenAI what do you think?", voices)?.displayName).toBe("OpenAI");
  });

  it("matches @Name at end of string", () => {
    expect(parseMention("question for @Gemini", voices)?.displayName).toBe("Gemini");
  });

  it("matches @Name followed by punctuation", () => {
    expect(parseMention("@Anthropic, can you help?", voices)?.displayName).toBe("Anthropic");
  });

  it("is case-insensitive", () => {
    expect(parseMention("@anthropic hello", voices)?.displayName).toBe("Anthropic");
    expect(parseMention("@OPENAI hello", voices)?.displayName).toBe("OpenAI");
  });

  it("returns the first mention when multiple are present", () => {
    expect(parseMention("@Anthropic and @OpenAI both", voices)?.displayName).toBe("Anthropic");
  });

  it("does not match @Name embedded inside a word", () => {
    expect(parseMention("test@Anthropic.com", voices)).toBeNull();
  });

  it("returns null for unknown voice name", () => {
    expect(parseMention("@Unknown hello", voices)).toBeNull();
  });

  it("escapes regex special chars in voice names", () => {
    const specialVoice = makeVoice("Voice.One");
    expect(parseMention("@Voice.One test", [specialVoice])?.displayName).toBe("Voice.One");
  });

  it("returns null for empty content", () => {
    expect(parseMention("", voices)).toBeNull();
  });

  it("returns null for empty voices array", () => {
    expect(parseMention("@Anthropic hello", [])).toBeNull();
  });
});

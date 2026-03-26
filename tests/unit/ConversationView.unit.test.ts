import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { ConversationView } from "../../src/ConversationView";
import type { Voice } from "../../src/types";

// Set up a minimal DOM environment
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement as typeof globalThis.HTMLElement;

function makeContainer(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

function makeVoice(overrides: Partial<Voice> = {}): Voice {
  return {
    id: "voice-1",
    displayName: "Anthropic",
    color: "#D4763B",
    avatarIcon: "anthropic",
    side: "left",
    ...overrides,
  };
}

describe("ConversationView", () => {
  let container: HTMLElement;
  let view: ConversationView;

  beforeEach(() => {
    container = makeContainer();
    view = new ConversationView(container);
  });

  describe("appendUserMessage", () => {
    it("adds a pm--user element with the content", () => {
      view.appendUserMessage("Hello world");
      const el = container.querySelector(".pm--user");
      expect(el).toBeTruthy();
      expect(el?.textContent).toContain("Hello world");
    });

    it("shows conductor name from profile", () => {
      view.setConductorProfile({ conductorName: "Corey", conductorColor: "#ff0000", conductorAvatar: "", pronouns: "" });
      view.appendUserMessage("Hi");
      expect(container.querySelector(".pm__name")?.textContent).toBe("Corey");
    });

    it("falls back to 'You' when no conductor name set", () => {
      view.appendUserMessage("Hi");
      expect(container.querySelector(".pm__name")?.textContent).toBe("You");
    });
  });

  describe("appendVoiceMessage", () => {
    it("adds a pm--voice element with the content", () => {
      view.appendVoiceMessage("voice-1", "Anthropic", "Hello from Anthropic", "#D4763B");
      const el = container.querySelector(".pm--voice");
      expect(el).toBeTruthy();
      expect(el?.textContent).toContain("Hello from Anthropic");
    });

    it("applies pm--left class for left side", () => {
      view.appendVoiceMessage("voice-1", "Anthropic", "Hi", "#D4763B", "left");
      expect(container.querySelector(".pm--left")).toBeTruthy();
    });

    it("applies pm--right class for right side", () => {
      view.appendVoiceMessage("voice-1", "OpenAI", "Hi", "#10A37F", "right");
      expect(container.querySelector(".pm--right")).toBeTruthy();
    });
  });

  describe("showPending", () => {
    it("creates a pending bubble for each voice", () => {
      view.showPending([
        makeVoice({ id: "v1", displayName: "Anthropic", side: "left" }),
        makeVoice({ id: "v2", displayName: "OpenAI", side: "right" }),
      ]);
      const pending = container.querySelectorAll(".pm--pending");
      expect(pending.length).toBe(2);
    });

    it("renders thinking dots in each pending bubble", () => {
      view.showPending([makeVoice()]);
      const dots = container.querySelectorAll(".pm__thinking-dot");
      expect(dots.length).toBe(3);
    });

    it("applies correct side class to pending bubbles", () => {
      view.showPending([makeVoice({ side: "right" })]);
      expect(container.querySelector(".pm--right")).toBeTruthy();
    });
  });

  describe("createChunkHandler", () => {
    it("transitions pending to streaming on first chunk", () => {
      view.showPending([makeVoice({ id: "v1" })]);
      const handler = view.createChunkHandler();
      handler({ voiceId: "v1", voiceName: "Anthropic", requestId: 1, delta: "Hello" });
      expect(container.querySelector(".pm--streaming")).toBeTruthy();
      expect(container.querySelector(".pm--pending")).toBeFalsy();
    });

    it("accumulates delta text", () => {
      view.showPending([makeVoice({ id: "v1" })]);
      const handler = view.createChunkHandler();
      handler({ voiceId: "v1", voiceName: "Anthropic", requestId: 1, delta: "Hello" });
      handler({ voiceId: "v1", voiceName: "Anthropic", requestId: 1, delta: " world" });
      expect(container.querySelector(".pm__bubble")?.textContent).toBe("Hello world");
    });

    it("creates a new bubble for an unknown voiceId", () => {
      const handler = view.createChunkHandler();
      handler({ voiceId: "unknown", voiceName: "Mystery", requestId: 1, delta: "Hi" });
      expect(container.querySelector(".pm--voice")).toBeTruthy();
    });
  });

  describe("finalizeStreaming", () => {
    it("removes streaming class from all active voices", () => {
      view.showPending([makeVoice({ id: "v1" })]);
      const handler = view.createChunkHandler();
      handler({ voiceId: "v1", voiceName: "Anthropic", requestId: 1, delta: "Hi" });
      view.finalizeStreaming();
      expect(container.querySelector(".pm--streaming")).toBeFalsy();
    });

    it("marks still-pending voices as no-response", () => {
      view.showPending([makeVoice({ id: "v1" })]);
      view.finalizeStreaming();
      expect(container.querySelector(".pm__bubble--no-response")).toBeTruthy();
    });
  });

  describe("showConductorTyping / hideConductorTyping", () => {
    it("shows conductor thinking dots", () => {
      view.showConductorTyping();
      expect(container.querySelector("[data-conductor-typing]")).toBeTruthy();
      expect(container.querySelector(".pm__thinking-dot")).toBeTruthy();
    });

    it("only shows one typing indicator even if called multiple times", () => {
      view.showConductorTyping();
      view.showConductorTyping();
      expect(container.querySelectorAll("[data-conductor-typing]").length).toBe(1);
    });

    it("removes the typing indicator", () => {
      view.showConductorTyping();
      view.hideConductorTyping();
      expect(container.querySelector("[data-conductor-typing]")).toBeFalsy();
    });

    it("appendUserMessage removes typing indicator and adds message", () => {
      view.showConductorTyping();
      view.appendUserMessage("Hello");
      expect(container.querySelector("[data-conductor-typing]")).toBeFalsy();
      expect(container.querySelector(".pm--user")).toBeTruthy();
    });
  });

  describe("clear", () => {
    it("removes all messages", () => {
      view.appendUserMessage("Hi");
      view.showPending([makeVoice()]);
      view.clear();
      expect(container.children.length).toBe(0);
    });
  });
});

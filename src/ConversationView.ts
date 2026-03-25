import type { StreamChunkHandler } from "./PolyphonClient";
import type { Voice } from "./types";

interface VoiceMessageState {
  voiceId: string;
  voiceName: string;
  color: string;
  wrapEl: HTMLElement;
  contentEl: HTMLElement;
  status: "pending" | "streaming" | "done";
  dotsEl: HTMLElement | null;
}

// Renders a unified chat thread where each message is labeled by voice.
// No Obsidian imports — can be unit tested in isolation.
export class ConversationView {
  private container: HTMLElement;
  private activeVoiceStates = new Map<string, VoiceMessageState>();

  constructor(container: HTMLElement) {
    this.container = container;
  }

  clear(): void {
    this.container.empty();
    this.activeVoiceStates.clear();
  }

  appendUserMessage(content: string): void {
    const el = this.container.createDiv({ cls: "polyphon-message polyphon-message--user" });
    const labelRow = el.createDiv({ cls: "polyphon-message-label-row" });
    labelRow.createSpan({ cls: "polyphon-message-label", text: "You" });
    el.createDiv({ cls: "polyphon-message-content", text: content });
    this.scrollToBottom();
  }

  // Creates pending placeholders for all voices immediately when a message is sent.
  showPending(voices: Voice[]): void {
    this.activeVoiceStates.clear();
    for (const voice of voices) {
      const wrapEl = this.container.createDiv({
        cls: "polyphon-message polyphon-message--voice polyphon-message--pending",
      });
      wrapEl.dataset.voiceId = voice.id;

      const labelRow = wrapEl.createDiv({ cls: "polyphon-message-label-row" });
      const dot = labelRow.createSpan({ cls: "polyphon-voice-dot" });
      dot.style.backgroundColor = voice.color;
      labelRow.createSpan({ cls: "polyphon-message-label", text: voice.displayName });

      const contentEl = wrapEl.createDiv({ cls: "polyphon-message-content polyphon-message-content--empty" });

      // Thinking dots
      const dotsEl = contentEl.createDiv({ cls: "polyphon-thinking-dots" });
      for (let i = 0; i < 3; i++) {
        const dot = dotsEl.createSpan({ cls: "polyphon-thinking-dot" });
        dot.style.animationDelay = `${i * 0.15}s`;
        dot.style.backgroundColor = voice.color;
      }

      this.activeVoiceStates.set(voice.id, {
        voiceId: voice.id,
        voiceName: voice.displayName,
        color: voice.color,
        wrapEl,
        contentEl,
        dotsEl,
        status: "pending",
      });
    }
    this.scrollToBottom();
  }

  // Returns a StreamChunkHandler to pass directly to client.broadcast().
  createChunkHandler(): StreamChunkHandler {
    return ({ voiceId, voiceName, delta }) => {
      let state = this.activeVoiceStates.get(voiceId);

      if (!state) {
        // Voice wasn't in the composition list — create it on the fly
        const wrapEl = this.container.createDiv({
          cls: "polyphon-message polyphon-message--voice polyphon-message--streaming",
        });
        wrapEl.dataset.voiceId = voiceId;
        const labelRow = wrapEl.createDiv({ cls: "polyphon-message-label-row" });
        labelRow.createSpan({ cls: "polyphon-message-label", text: voiceName });
        const contentEl = wrapEl.createDiv({ cls: "polyphon-message-content" });
        state = { voiceId, voiceName, color: "", wrapEl, contentEl, dotsEl: null, status: "streaming" };
        this.activeVoiceStates.set(voiceId, state);
      }

      if (state.status === "pending") {
        // First chunk — remove thinking dots, transition to streaming
        state.dotsEl?.remove();
        state.dotsEl = null;
        state.contentEl.removeClass("polyphon-message-content--empty");
        state.wrapEl.removeClass("polyphon-message--pending");
        state.wrapEl.addClass("polyphon-message--streaming");
        state.status = "streaming";
      }

      state.contentEl.textContent = (state.contentEl.textContent ?? "") + delta;
      this.scrollToBottom();
    };
  }

  // Called after broadcast() resolves — removes streaming indicators.
  finalizeStreaming(): void {
    for (const state of this.activeVoiceStates.values()) {
      // If still pending (voice never replied), remove thinking dots and show empty state
      if (state.status === "pending") {
        state.dotsEl?.remove();
        state.dotsEl = null;
        state.contentEl.removeClass("polyphon-message-content--empty");
        state.wrapEl.removeClass("polyphon-message--pending");
        if (!state.contentEl.textContent) {
          state.contentEl.addClass("polyphon-message-content--no-response");
          state.contentEl.textContent = "No response";
        }
      }
      state.wrapEl.removeClass("polyphon-message--streaming");
      state.status = "done";
    }
    this.activeVoiceStates.clear();
  }

  private scrollToBottom(): void {
    this.container.scrollTop = this.container.scrollHeight;
  }
}

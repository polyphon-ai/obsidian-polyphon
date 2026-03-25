import type { PolyphonClient, StreamChunkHandler } from "./PolyphonClient";

interface VoiceStream {
  voiceId: string;
  voiceName: string;
  el: HTMLElement;
  contentEl: HTMLElement;
}

// Renders a unified chat thread where each message is labeled by voice.
// No Obsidian imports — can be unit tested in isolation.
export class ConversationView {
  private container: HTMLElement;
  private activeStreams = new Map<string, VoiceStream>();

  constructor(container: HTMLElement) {
    this.container = container;
  }

  clear(): void {
    this.container.empty();
    this.activeStreams.clear();
  }

  appendUserMessage(content: string): void {
    const el = this.container.createDiv({ cls: "polyphon-message polyphon-message--user" });
    el.createDiv({ cls: "polyphon-message-label", text: "You" });
    el.createDiv({ cls: "polyphon-message-content", text: content });
    this.scrollToBottom();
  }

  appendVoiceMessage(voiceId: string, voiceName: string, content: string): void {
    const el = this.container.createDiv({ cls: "polyphon-message polyphon-message--voice" });
    el.dataset.voiceId = voiceId;
    el.createDiv({ cls: "polyphon-message-label", text: voiceName });
    el.createDiv({ cls: "polyphon-message-content", text: content });
    this.scrollToBottom();
  }

  // Returns a StreamChunkHandler that progressively renders incoming deltas.
  // The caller is responsible for registering it with client.onStreamChunk()
  // and deregistering it after the broadcast resolves.
  getStreamHandler(client: PolyphonClient): StreamChunkHandler {
    const handler: StreamChunkHandler = ({ voiceId, voiceName, delta }) => {
      let stream = this.activeStreams.get(voiceId);
      if (!stream) {
        const el = this.container.createDiv({ cls: "polyphon-message polyphon-message--voice polyphon-message--streaming" });
        el.dataset.voiceId = voiceId;
        el.createDiv({ cls: "polyphon-message-label", text: voiceName });
        const contentEl = el.createDiv({ cls: "polyphon-message-content" });
        stream = { voiceId, voiceName, el, contentEl };
        this.activeStreams.set(voiceId, stream);
      }
      stream.contentEl.textContent = (stream.contentEl.textContent ?? "") + delta;
      this.scrollToBottom();
    };
    client.onStreamChunk(handler);
    return handler;
  }

  // Cleans up streaming state after a broadcast completes.
  finalizeStreaming(): void {
    for (const stream of this.activeStreams.values()) {
      stream.el.removeClass("polyphon-message--streaming");
    }
    this.activeStreams.clear();
  }

  private scrollToBottom(): void {
    this.container.scrollTop = this.container.scrollHeight;
  }
}

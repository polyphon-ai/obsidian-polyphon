import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type PolyphonPlugin from "./main";
import { PolyphonClient } from "./PolyphonClient";
import { ConversationView } from "./ConversationView";
import type { Composition, Session, ConnectionStatus } from "./types";

export const POLYPHON_SIDEBAR_VIEW_TYPE = "polyphon-sidebar";

export class PolyphonSidebarView extends ItemView {
  private plugin: PolyphonPlugin;
  private client: PolyphonClient;
  private status: ConnectionStatus = "disconnected";

  private statusBar: HTMLElement | null = null;
  private compositionSelect: HTMLSelectElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private sendBtn: HTMLButtonElement | null = null;
  private conversationView: ConversationView | null = null;

  private compositions: Composition[] = [];
  private activeSession: Session | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: PolyphonPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.client = plugin.client;
  }

  getViewType(): string { return POLYPHON_SIDEBAR_VIEW_TYPE; }
  getDisplayText(): string { return "Polyphon"; }
  getIcon(): string { return "message-square"; }

  async onOpen(): Promise<void> {
    this.buildLayout();
    await this.connect();
  }

  async onClose(): Promise<void> {
    this.client.disconnect();
  }

  /** Called from main.ts when settings change and client is replaced. */
  onClientReplaced(client: PolyphonClient): void {
    this.client = client;
    void this.connect();
  }

  // ---- Layout ----

  private buildLayout(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("polyphon-sidebar");

    // Status bar
    this.statusBar = root.createDiv({ cls: "polyphon-status-bar" });
    this.renderStatus();

    // Composition selector
    const topBar = root.createDiv({ cls: "polyphon-top-bar" });
    this.compositionSelect = topBar.createEl("select", { cls: "polyphon-composition-select" });
    this.compositionSelect.createEl("option", { text: "— select a composition —", attr: { value: "" } });
    this.compositionSelect.addEventListener("change", () => void this.onCompositionSelected());

    const newSessionBtn = topBar.createEl("button", { cls: "polyphon-btn polyphon-btn--icon", text: "+" });
    newSessionBtn.title = "New session";
    newSessionBtn.addEventListener("click", () => void this.startNewSession());

    // Conversation area
    const conversationEl = root.createDiv({ cls: "polyphon-conversation" });
    this.conversationView = new ConversationView(conversationEl);

    // Input area
    const inputArea = root.createDiv({ cls: "polyphon-input-area" });
    this.inputEl = inputArea.createEl("textarea", {
      cls: "polyphon-input",
      attr: { placeholder: "Message all voices…", rows: "3" },
    });
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void this.sendMessage();
      }
    });
    this.sendBtn = inputArea.createEl("button", { cls: "polyphon-btn polyphon-btn--send", text: "Send" });
    this.sendBtn.addEventListener("click", () => void this.sendMessage());
    this.setSendEnabled(false);
  }

  private renderStatus(): void {
    if (!this.statusBar) return;
    this.statusBar.empty();
    this.statusBar.className = `polyphon-status-bar polyphon-status-bar--${this.status}`;
    const labels: Record<ConnectionStatus, string> = {
      disconnected: "Not connected",
      connecting: "Connecting…",
      connected: "Connected",
      error: "Connection error",
    };
    this.statusBar.createSpan({ cls: "polyphon-status-dot" });
    this.statusBar.createSpan({ cls: "polyphon-status-label", text: labels[this.status] });

    if (this.status === "disconnected" || this.status === "error") {
      const retryBtn = this.statusBar.createEl("button", { cls: "polyphon-btn polyphon-btn--retry", text: "Retry" });
      retryBtn.addEventListener("click", () => void this.connect());
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.renderStatus();
    this.setSendEnabled(status === "connected" && this.activeSession !== null);
  }

  private setSendEnabled(enabled: boolean): void {
    if (this.sendBtn) this.sendBtn.disabled = !enabled;
    if (this.inputEl) this.inputEl.disabled = !enabled;
  }

  // ---- Connection ----

  private async connect(): Promise<void> {
    this.setStatus("connecting");
    try {
      await this.client.connect();
      this.setStatus("connected");
      await this.loadCompositions();
    } catch {
      this.setStatus("error");
    }
  }

  private async loadCompositions(): Promise<void> {
    try {
      this.compositions = await this.client.compositions();
      this.populateCompositionSelect();
    } catch {
      new Notice("Polyphon: failed to load compositions.");
    }
  }

  private populateCompositionSelect(): void {
    if (!this.compositionSelect) return;
    this.compositionSelect.empty();
    this.compositionSelect.createEl("option", { text: "— select a composition —", attr: { value: "" } });
    for (const comp of this.compositions) {
      this.compositionSelect.createEl("option", { text: comp.name, attr: { value: comp.id } });
    }
  }

  // ---- Session ----

  private async onCompositionSelected(): Promise<void> {
    const id = this.compositionSelect?.value;
    if (!id) return;
    await this.startNewSession(id);
  }

  private async startNewSession(compositionId?: string): Promise<void> {
    const id = compositionId ?? this.compositionSelect?.value;
    if (!id) return;
    try {
      this.activeSession = await this.client.createSession(id);
      this.conversationView?.clear();
      this.setSendEnabled(true);
    } catch {
      new Notice("Polyphon: failed to create session.");
    }
  }

  // ---- Messaging ----

  private async sendMessage(): Promise<void> {
    const content = this.inputEl?.value.trim();
    if (!content || !this.activeSession) return;
    if (this.inputEl) this.inputEl.value = "";

    this.conversationView?.appendUserMessage(content);
    this.setSendEnabled(false);

    const onChunk = this.conversationView?.createChunkHandler();

    try {
      await this.client.broadcast(this.activeSession.id, content, onChunk);
    } catch (err) {
      new Notice("Polyphon: failed to send message.");
      if (this.plugin.settings.debugMode) console.error("[Polyphon]", err);
    } finally {
      this.conversationView?.finalizeStreaming();
      this.setSendEnabled(true);
    }
  }
}

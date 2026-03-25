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
  private sessionRow: HTMLElement | null = null;
  private sessionSelect: HTMLSelectElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private sendBtn: HTMLButtonElement | null = null;
  private sessionHeaderEl: HTMLElement | null = null;
  private conversationView: ConversationView | null = null;

  private compositions: Composition[] = [];
  private activeComposition: Composition | null = null;
  private activeSession: Session | null = null;
  private lastSentFilePath: string | null = null;

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

    // Composition selector row
    const topBar = root.createDiv({ cls: "polyphon-top-bar" });
    this.compositionSelect = topBar.createEl("select", { cls: "polyphon-select" });
    this.compositionSelect.createEl("option", { text: "— select a composition —", attr: { value: "" } });
    this.compositionSelect.addEventListener("change", () => void this.onCompositionSelected());

    // Session selector row (hidden until composition selected)
    this.sessionRow = root.createDiv({ cls: "polyphon-session-row polyphon-session-row--hidden" });
    this.sessionSelect = this.sessionRow.createEl("select", { cls: "polyphon-select polyphon-session-select" });
    this.sessionSelect.addEventListener("change", () => void this.onSessionSelected());
    const newBtn = this.sessionRow.createEl("button", { cls: "polyphon-btn polyphon-btn--new", text: "New" });
    newBtn.title = "Start a new session";
    newBtn.addEventListener("click", () => void this.startNewSession());

    // Session name header (shown when a session is active)
    this.sessionHeaderEl = root.createDiv({ cls: "polyphon-session-header polyphon-session-header--hidden" });

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

  // ---- Status ----

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

  // ---- Composition selection ----

  private async onCompositionSelected(): Promise<void> {
    const id = this.compositionSelect?.value;
    if (!id) {
      this.sessionRow?.addClass("polyphon-session-row--hidden");
      return;
    }
    this.activeComposition = this.compositions.find((c) => c.id === id) ?? null;
    await this.loadSessions(id);
  }

  private async loadSessions(compositionId: string): Promise<void> {
    if (!this.sessionSelect || !this.sessionRow) return;
    try {
      const sessions = await this.client.sessions(compositionId);
      this.sessionSelect.empty();
      this.sessionSelect.createEl("option", { text: "— resume a session —", attr: { value: "" } });
      // Most recent first
      const sorted = sessions
        .filter((s) => !s.archived)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      for (const s of sorted) {
        const date = new Date(s.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
        this.sessionSelect.createEl("option", { text: `${s.name} · ${date}`, attr: { value: s.id } });
      }
      this.sessionRow.removeClass("polyphon-session-row--hidden");
    } catch {
      new Notice("Polyphon: failed to load sessions.");
    }
  }

  // ---- Session selection / creation ----

  private async onSessionSelected(): Promise<void> {
    const id = this.sessionSelect?.value;
    if (!id) return;
    await this.resumeSession(id);
  }

  private async resumeSession(sessionId: string): Promise<void> {
    try {
      const session = await this.client.getSession(sessionId);
      this.activeSession = session;
      this.lastSentFilePath = null;
      this.conversationView?.clear();

      // Load existing messages
      const messages = await this.client.sessionMessages(sessionId);
      for (const msg of messages) {
        if (msg.role === "conductor") {
          this.conversationView?.appendUserMessage(msg.content);
        } else if (msg.role === "voice" && msg.voiceId && msg.voiceName) {
          this.conversationView?.appendVoiceMessage(msg.voiceId, msg.voiceName, msg.content, this.activeComposition?.voices.find((v) => v.id === msg.voiceId)?.color ?? "");
        }
      }

      this.renderSessionHeader(session);
      this.setSendEnabled(true);
    } catch {
      new Notice("Polyphon: failed to resume session.");
    }
  }

  private async startNewSession(): Promise<void> {
    const compositionId = this.compositionSelect?.value;
    if (!compositionId) return;
    try {
      const vaultPath = (this.app.vault.adapter as { basePath?: string }).basePath ?? undefined;
      const vaultName = this.app.vault.getName();
      const date = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const name = `${vaultName} · ${date}`;

      const session = await this.client.createSession(compositionId, name, vaultPath);
      this.activeSession = session;
      this.lastSentFilePath = null;
      this.conversationView?.clear();
      this.renderSessionHeader(session);
      this.setSendEnabled(true);

      // Refresh session list and select the new one
      await this.loadSessions(compositionId);
      if (this.sessionSelect) {
        // Find the option matching the new session id
        const option = Array.from(this.sessionSelect.options).find((o) => o.value === session.id);
        if (option) this.sessionSelect.value = session.id;
      }
    } catch {
      new Notice("Polyphon: failed to create session.");
    }
  }

  private renderSessionHeader(session: Session): void {
    if (!this.sessionHeaderEl) return;
    this.sessionHeaderEl.empty();
    this.sessionHeaderEl.removeClass("polyphon-session-header--hidden");
    this.sessionHeaderEl.createSpan({ cls: "polyphon-session-name", text: session.name });
  }

  // ---- Messaging ----

  private async sendMessage(): Promise<void> {
    const content = this.inputEl?.value.trim();
    if (!content || !this.activeSession) return;
    if (this.inputEl) this.inputEl.value = "";

    // Prepend current file path if it changed since the last message
    const activeFile = this.app.workspace.getActiveFile();
    const vaultBase = (this.app.vault.adapter as { basePath?: string }).basePath ?? "";
    const currentPath = activeFile ? `${vaultBase}/${activeFile.path}` : null;
    const messageContent = (currentPath && currentPath !== this.lastSentFilePath)
      ? `> Current file: ${currentPath}\n\n${content}`
      : content;
    if (currentPath) this.lastSentFilePath = currentPath;

    this.conversationView?.appendUserMessage(content);

    const voices = this.activeComposition?.voices ?? [];
    this.conversationView?.showPending(voices);
    this.setSendEnabled(false);

    const onChunk = this.conversationView?.createChunkHandler();

    try {
      await this.client.broadcast(this.activeSession.id, messageContent, onChunk);
    } catch (err) {
      new Notice("Polyphon: failed to send message.");
      if (this.plugin.settings.debugMode) console.error("[Polyphon]", err);
    } finally {
      this.conversationView?.finalizeStreaming();
      this.setSendEnabled(true);
    }
  }
}

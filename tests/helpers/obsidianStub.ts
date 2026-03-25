// Minimal stub for the 'obsidian' module so unit/integration tests can
// import plugin code without a real Obsidian runtime.

export class Plugin {
  app: unknown = {};
  loadData = async () => ({});
  saveData = async () => {};
  addRibbonIcon = () => ({ remove: () => {} });
  addCommand = () => {};
  addSettingTab = () => {};
  registerView = () => {};
}

export class ItemView {
  containerEl = { children: [null, document.createElement("div")] } as unknown as HTMLElement;
  leaf: unknown;
  constructor(leaf: unknown) { this.leaf = leaf; }
  getViewType() { return ""; }
  getDisplayText() { return ""; }
  getIcon() { return ""; }
}

export class PluginSettingTab {
  app: unknown;
  plugin: unknown;
  containerEl = document.createElement("div");
  constructor(app: unknown, plugin: unknown) { this.app = app; this.plugin = plugin; }
  display() {}
}

export class Setting {
  constructor(_: HTMLElement) {}
  setHeading() { return this; }
  setName(_: string) { return this; }
  setDesc(_: string) { return this; }
  addText(_: (t: { setPlaceholder: (s: string) => unknown; setValue: (s: string) => unknown; onChange: (fn: (v: string) => void) => unknown; inputEl: HTMLInputElement }) => void) { return this; }
  addToggle(_: (t: { setValue: (v: boolean) => unknown; onChange: (fn: (v: boolean) => void) => unknown }) => void) { return this; }
}

export class Notice {
  constructor(_: string) {}
}

export class WorkspaceLeaf {}

import { App, PluginSettingTab, Setting } from "obsidian";
import type PolyphonPlugin from "./main";

export const DEFAULT_SETTINGS = {
  host: "127.0.0.1",
  port: 51234,
  token: "",
  persistConversations: false,
  debugMode: false,
};

export class PolyphonSettingTab extends PluginSettingTab {
  plugin: PolyphonPlugin;

  constructor(app: App, plugin: PolyphonPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("polyphon-settings");

    new Setting(containerEl).setHeading().setName("Connection");

    new Setting(containerEl)
      .setName("Host")
      .setDesc("Hostname or IP of the running Polyphon instance.")
      .addText((text) =>
        text
          .setPlaceholder("127.0.0.1")
          .setValue(this.plugin.settings.host)
          .onChange(async (value) => {
            this.plugin.settings.host = value.trim() || "127.0.0.1";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Port")
      .setDesc("TCP port Polyphon is listening on.")
      .addText((text) =>
        text
          .setPlaceholder("51234")
          .setValue(String(this.plugin.settings.port))
          .onChange(async (value) => {
            const port = parseInt(value, 10);
            if (!isNaN(port) && port > 0 && port < 65536) {
              this.plugin.settings.port = port;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("API token")
      .setDesc("Token from Polyphon's API settings. Leave blank if authentication is disabled.")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("polyphon_...")
          .setValue(this.plugin.settings.token)
          .onChange(async (value) => {
            this.plugin.settings.token = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl).setHeading().setName("Options");

    new Setting(containerEl)
      .setName("Persist conversations")
      .setDesc("Save and restore conversation history across Obsidian restarts.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.persistConversations).onChange(async (value) => {
          this.plugin.settings.persistConversations = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Debug mode")
      .setDesc("Log raw JSON-RPC frames to the console.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.debugMode).onChange(async (value) => {
          this.plugin.settings.debugMode = value;
          await this.plugin.saveSettings();
        })
      );
  }
}

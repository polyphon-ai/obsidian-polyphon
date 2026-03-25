// Types shared across the plugin. Mirrors shapes from Polyphon's shared/api.ts
// and shared/types.ts — kept as a local copy so we have no runtime dep on the main app.

// ---- Connection ----

export interface PolyphonConnectionConfig {
  host: string;
  port: number;
  token: string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

// ---- JSON-RPC ----

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  result?: T;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface StreamChunkNotification {
  jsonrpc: "2.0";
  method: "stream.chunk";
  params: {
    requestId: number | string;
    voiceId: string;
    voiceName: string;
    delta: string;
  };
}

// ---- Polyphon domain types ----

export interface Composition {
  id: string;
  name: string;
  mode: "conductor" | "broadcast";
  voices: Voice[];
}

export interface Voice {
  id: string;
  displayName: string;
  color: string;
  avatarIcon: string;
}

export interface Session {
  id: string;
  compositionId: string;
  name: string;
  mode: "conductor" | "broadcast";
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  workingDir: string | null;
  sandboxedToWorkingDir: boolean;
}

export interface Message {
  id: string;
  sessionId: string;
  voiceId: string | null;
  voiceName: string | null;
  role: "conductor" | "voice" | "system";
  content: string;
  timestamp: number;
  roundIndex: number;
}

export interface ConductorProfile {
  conductorName: string;
  conductorColor: string;
  conductorAvatar: string;
  pronouns: string;
}

// ---- Plugin settings ----

export interface PluginSettings {
  host: string;
  port: number;
  token: string;
  persistConversations: boolean;
  debugMode: boolean;
}

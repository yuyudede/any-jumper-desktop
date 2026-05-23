/// <reference types="vite/client" />

interface Window {
  anyJumper?: {
    invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
    onAgentEvent(handler: (event: unknown) => void): () => void;
    onAgentBridgeEvent?: (handler: (event: unknown) => void) => () => void;
    pickDirectory(): Promise<string | null>;
    pickFiles?: () => Promise<string[]>;
    terminalInvoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    onTerminalData(handler: (event: { id: string; data: string }) => void): () => void;
    onTerminalExit(handler: (event: { id: string }) => void): () => void;
  };
}

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("anyJumper", {
  invoke(command: string, args?: Record<string, unknown>) {
    return ipcRenderer.invoke("any-jumper:invoke", command, args ?? {});
  },
  onAgentEvent(handler: (event: unknown) => void) {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => handler(payload);
    ipcRenderer.on("agent-event", listener);
    return () => ipcRenderer.off("agent-event", listener);
  },
  onAgentBridgeEvent(handler: (event: unknown) => void) {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => handler(payload);
    ipcRenderer.on("agent-bridge-event", listener);
    return () => ipcRenderer.off("agent-bridge-event", listener);
  },
  pickDirectory() {
    return ipcRenderer.invoke("any-jumper:pick-directory");
  },
  pickFiles() {
    return ipcRenderer.invoke("any-jumper:pick-files");
  },
  terminalInvoke(command: string, args?: Record<string, unknown>) {
    return ipcRenderer.invoke("any-jumper:invoke", command, args ?? {});
  },
  portalInvoke(command: string, args?: Record<string, unknown>) {
    return ipcRenderer.invoke("any-jumper:invoke", command, args ?? {});
  },
  onTerminalData(handler: (event: { id: string; data: string }) => void) {
    const listener = (_event: Electron.IpcRendererEvent, payload: { id: string; data: string }) => handler(payload);
    ipcRenderer.on("terminal-data", listener);
    return () => ipcRenderer.off("terminal-data", listener);
  },
  onTerminalExit(handler: (event: { id: string }) => void) {
    const listener = (_event: Electron.IpcRendererEvent, payload: { id: string }) => handler(payload);
    ipcRenderer.on("terminal-exit", listener);
    return () => ipcRenderer.off("terminal-exit", listener);
  },
});

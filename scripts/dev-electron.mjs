import { spawn } from "node:child_process";
import process from "node:process";
import { createServer } from "vite";

const host = "127.0.0.1";
const preferredPort = 1420;
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

let viteServer;
let electronProcess;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${signal ?? code}`));
    });
  });
}

function firstLocalUrl(server) {
  const localUrls = server.resolvedUrls?.local ?? [];
  return localUrls.find((url) => url.startsWith(`http://${host}:`)) ?? localUrls[0];
}

async function shutdown(signal) {
  if (electronProcess && !electronProcess.killed) {
    electronProcess.kill(signal);
  }
  if (viteServer) {
    await viteServer.close();
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void shutdown(signal).finally(() => process.exit(0));
  });
}

try {
  viteServer = await createServer({
    clearScreen: false,
    server: {
      host,
      port: preferredPort,
      strictPort: false,
    },
  });
  await viteServer.listen();
  viteServer.printUrls();

  const devServerUrl = firstLocalUrl(viteServer);
  if (!devServerUrl) {
    throw new Error("Vite did not expose a local dev server URL.");
  }

  await run(pnpmBin, ["build:main"]);

  electronProcess = spawn(pnpmBin, ["exec", "electron", "."], {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: devServerUrl,
    },
  });

  electronProcess.on("exit", (code, signal) => {
    void shutdown(signal ?? "SIGTERM").finally(() => process.exit(code ?? 0));
  });
  electronProcess.on("error", (error) => {
    console.error(error);
    void shutdown("SIGTERM").finally(() => process.exit(1));
  });
} catch (error) {
  console.error(error);
  await shutdown("SIGTERM");
  process.exit(1);
}

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-electron/**",
      "**/release/**",
      "package/**",
    ],
  },
  server: {
    strictPort: false,
    host: "127.0.0.1",
    port: 1420,
  },
  envPrefix: ["VITE_"],
});

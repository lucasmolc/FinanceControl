import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Versão do sistema exibida na tela de login: vem do package.json, para não haver duas fontes da verdade.
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:5074" } },
  build: { outDir: "dist", emptyOutDir: true }
});

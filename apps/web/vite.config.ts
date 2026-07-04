import { fileURLToPath } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import flowCss from "@flow-css/vite";
import { nitro } from "nitro/vite";
import { config as loadEnv } from "dotenv";

// Env is scoped repo-wide: load the root .env into process.env before the
// dev/build server starts so server code (e.g. src/secrets.ts) can read it.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
loadEnv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

export default defineConfig({
  envDir: repoRoot,
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    flowCss(),
    tanstackStart({
      srcDirectory: "src",
    }),
    viteReact(),
    nitro({ serverDir: "server" }),
  ],
});

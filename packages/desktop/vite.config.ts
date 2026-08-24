import { defineConfig, loadEnv } from "vite";
import path from "node:path";
import electron from "vite-plugin-electron/simple";

const root = path.resolve(__dirname, "../..");

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, root, ""));

  return {
    build: {
      rollupOptions: {
        input: path.join(__dirname, "electron/__no-renderer.ts"),
      },
    },
    plugins: [
      electron({
        main: {
          entry: "electron/main.ts",
        },
        preload: {
          input: path.join(__dirname, "electron/preload.ts"),
        },
      }),
    ],
    server: {
      allowedHosts: true,
    },
  };
});

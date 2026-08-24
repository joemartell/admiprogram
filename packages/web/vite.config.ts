import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite"
import path from "path";
import runableAnalyticsPlugin from "./vite/__plugins/runable-analytics-plugin";
import honoDevPlugin from "./vite/__plugins/hono-dev-plugin";
import assetOptimizerPlugin from "./vite/__plugins/asset-optimizer-plugin";

const root = path.resolve(__dirname, "../..");

function getWebsitePort(websiteUrl: string | undefined): number {
	if (!websiteUrl) return 3000;

	try {
		return Number(new URL(websiteUrl).port || 3000);
	} catch {
		return 3000;
	}
}

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, root, '');
	Object.assign(process.env, env);
	const websitePort = getWebsitePort(process.env.WEBSITE_URL);

	return {
		// All env files live at the repo root — keep Vite's own env loading there too,
		// so packages/web/.env* files can never shadow the root .env.
		envDir: root,
		plugins: [honoDevPlugin(), react(), runableAnalyticsPlugin(), tailwind(), assetOptimizerPlugin()],
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "./src/web"),
			},
		},
		server: {
			port: websitePort,
			strictPort: true,
			allowedHosts: true,
			hmr: { overlay: false, },
			cors: false
		}
	};
});

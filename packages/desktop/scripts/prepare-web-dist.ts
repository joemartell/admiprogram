import { cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDist = path.resolve(desktopRoot, "../web/dist");
const packagedWebDist = path.join(desktopRoot, "web-dist");

await rm(packagedWebDist, { recursive: true, force: true });
await cp(webDist, packagedWebDist, { recursive: true });

console.log(`Prepared desktop renderer from ${webDist}`);

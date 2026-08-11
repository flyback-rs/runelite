import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

await build({
	entryPoints: [resolve(root, "src/serve.ts")],
	outfile: resolve(root, "dist/serve.js"),
	bundle: true,
	format: "esm",
	platform: "node",
	target: "node22",
	// ws is a native-ish dependency; keep it external and resolved at runtime.
	packages: "external",
	sourcemap: true,
	logLevel: "info",
});
console.log("[gateway] build done");

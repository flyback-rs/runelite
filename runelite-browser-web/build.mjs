import { build, context } from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(root, "dist");
const wasmDir = resolve(root, "../runelite-browser-core/build/teavm/wasm-gc");
const watch = process.argv.includes("--watch");

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });
if (existsSync(resolve(root, "public"))) {
	cpSync(resolve(root, "public"), outdir, { recursive: true });
}
for (const file of ["runelite-browser.wasm", "runelite-browser.wasm-runtime.js"]) {
	const src = resolve(wasmDir, file);
	if (existsSync(src)) {
		cpSync(src, resolve(outdir, file));
	} else {
		console.warn(`[build] missing ${file} — run "gradle buildWasmGC" first`);
	}
}

const options = {
	entryPoints: {
		main: resolve(root, "src/main.ts"),
		"render.worker": resolve(root, "src/workers/render.worker.ts"),
		"game.worker": resolve(root, "src/workers/game.worker.ts"),
		sw: resolve(root, "src/sw.ts"),
	},
	entryNames: "[name]",
	outdir,
	bundle: true,
	format: "esm",
	target: "es2022",
	platform: "browser",
	sourcemap: true,
	minify: !watch,
	loader: { ".wgsl": "text", ".glsl": "text" },
	logLevel: "info",
};

if (watch) {
	const ctx = await context(options);
	await ctx.watch();
	console.log("[build] watching");
} else {
	await build(options);
	console.log("[build] done");
}

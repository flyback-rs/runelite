import { build, context } from "esbuild";
import { appendFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
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
	if (!existsSync(src)) {
		throw new Error(
			`[build] missing ${file} in ${wasmDir} — run "gradle -p ../runelite-browser-core buildWasmGC" first`,
		);
	}
	cpSync(src, resolve(outdir, file));
}
// The generated runtime is a classic IIFE assigning a module-local `TeaVM`.
// Append an ESM export so the game worker can `import()` it (CSP-safe; no eval).
appendFileSync(resolve(outdir, "runelite-browser.wasm-runtime.js"), "\nexport default TeaVM;\n");

// The RuneScape fonts bundled with the client; the render worker bakes its
// glyph atlas from these (see src/text/atlas.ts).
const fontSrc = resolve(root, "../runelite-client/src/main/resources/net/runelite/client/ui");
mkdirSync(resolve(outdir, "fonts"), { recursive: true });
for (const font of ["runescape.ttf", "runescape_bold.ttf", "runescape_small.ttf"]) {
	const src = resolve(fontSrc, font);
	if (!existsSync(src)) {
		throw new Error(`[build] missing font ${src}`);
	}
	cpSync(src, resolve(outdir, "fonts", font));
}

const options = {
	entryPoints: {
		main: resolve(root, "src/main.ts"),
		"render.worker": resolve(root, "src/workers/render.worker.ts"),
		"game.worker": resolve(root, "src/workers/game.worker.ts"),
		netprobe: resolve(root, "src/netprobe.ts"),
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
	define: { __DEV__: watch ? "true" : "false" },
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

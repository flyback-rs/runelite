import { readFile } from "node:fs/promises";
import http from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(fileURLToPath(import.meta.url), "..", "dist");
const port = Number(process.env["PORT"] ?? 8080);

const TYPES = {
	".html": "text/html",
	".js": "text/javascript",
	".json": "application/json",
	".map": "application/json",
	".ttf": "font/ttf",
	".wasm": "application/wasm",
	".webmanifest": "application/manifest+json",
};

// Cross-origin isolation (COOP/COEP) is required for SharedArrayBuffer.
const server = http.createServer(async (req, res) => {
	try {
		const url = new URL(req.url ?? "/", "http://localhost");
		let pathname = decodeURIComponent(url.pathname);
		if (pathname === "/") {
			pathname = "/index.html";
		}
		const body = await readFile(join(dist, pathname));
		res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
		res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
		res.setHeader("Content-Type", TYPES[extname(pathname)] ?? "application/octet-stream");
		res.end(body);
	} catch {
		res.statusCode = 404;
		res.end("not found");
	}
});

server.listen(port, () => {
	console.log(`serving dist/ on http://localhost:${port} (COOP/COEP enabled)`);
});

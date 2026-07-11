// Static server for the CheerpJ boot spike. CheerpJ needs cross-origin isolation
// (COOP/COEP) for SharedArrayBuffer, and its cross-origin runtime is loaded from
// a CDN that sets its own CORP headers, so require-corp is compatible.
import { readFile } from "node:fs/promises";
import http from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "..");
const port = Number(process.env["PORT"] ?? 8095);

const TYPES = {
	".html": "text/html",
	".js": "text/javascript",
	".json": "application/json",
	".jar": "application/java-archive",
	".wasm": "application/wasm",
};

const server = http.createServer(async (req, res) => {
	try {
		const url = new URL(req.url ?? "/", "http://localhost");
		let pathname = decodeURIComponent(url.pathname);
		if (pathname === "/") {
			pathname = "/index.html";
		}
		// CheerpJ mounts this origin at /app/; strip that prefix back to disk.
		if (pathname.startsWith("/app/")) {
			pathname = pathname.slice(4);
		}
		const filePath = normalize(join(root, pathname));
		if (!filePath.startsWith(root)) {
			res.statusCode = 403;
			res.end("forbidden");
			return;
		}
		const body = await readFile(filePath);
		res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
		res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
		res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
		res.setHeader("Content-Type", TYPES[extname(filePath)] ?? "application/octet-stream");
		res.end(body);
	} catch {
		res.statusCode = 404;
		res.end("not found");
	}
});

server.listen(port, () => {
	console.log(`CheerpJ spike on http://localhost:${port} (COOP/COEP enabled)`);
});

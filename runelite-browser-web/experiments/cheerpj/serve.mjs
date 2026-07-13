// Static server for the CheerpJ boot spike.
//
// Two CheerpJ-specific requirements (https://cheerpj.com/docs/guides/basic-server-setup.html):
//   1. NO COOP/COEP: CheerpJ establishes its own cross-origin-isolated context
//      via a cross-origin frame (c.html) on its CDN. Setting COEP: require-corp
//      here breaks that frame (it ships CORP but not COEP), which Firefox rejects
//      with NS_ERROR_DOM_COEP_FAILED. So this server sends no isolation headers.
//   2. Range requests: CheerpJ downloads JARs and runtime in chunks and needs
//      HTTP Range support, so this serves 206 Partial Content for `Range:`.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
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

		const stats = await stat(filePath);
		const size = stats.size;
		res.setHeader("Content-Type", TYPES[extname(filePath)] ?? "application/octet-stream");
		res.setHeader("Accept-Ranges", "bytes");

		const parsed = parseRange(req.headers.range, size);
		if (parsed === "invalid") {
			res.statusCode = 416;
			res.setHeader("Content-Range", `bytes */${size}`);
			res.end();
			return;
		}
		if (parsed) {
			res.statusCode = 206;
			res.setHeader("Content-Range", `bytes ${parsed.start}-${parsed.end}/${size}`);
			res.setHeader("Content-Length", parsed.end - parsed.start + 1);
			createReadStream(filePath, { start: parsed.start, end: parsed.end }).pipe(res);
			return;
		}
		res.statusCode = 200;
		res.setHeader("Content-Length", size);
		createReadStream(filePath).pipe(res);
	} catch {
		res.statusCode = 404;
		res.end("not found");
	}
});

/** Parses a single-range `bytes=start-end` header; null = no range, "invalid" = 416. */
function parseRange(header, size) {
	if (!header) {
		return null;
	}
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) {
		return "invalid";
	}
	const hasStart = match[1] !== "";
	const hasEnd = match[2] !== "";
	let start = hasStart ? Number(match[1]) : 0;
	let end = hasEnd ? Number(match[2]) : size - 1;
	if (!hasStart && hasEnd) {
		// suffix range: last N bytes
		start = Math.max(0, size - Number(match[2]));
		end = size - 1;
	}
	if (start > end || start < 0 || end >= size) {
		return "invalid";
	}
	return { start, end };
}

server.listen(port, () => {
	console.log(`CheerpJ spike on http://localhost:${port} (range requests, no COOP/COEP)`);
});

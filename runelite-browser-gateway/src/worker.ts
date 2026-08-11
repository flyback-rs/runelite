/// <reference types="@cloudflare/workers-types" />
import { connect } from "cloudflare:sockets";
import { DEFAULT_RULES, isAllowed, parseRules } from "./allowlist.ts";

// The gateway as a Cloudflare Worker: the same blind WebSocket<->TCP relay as
// serve.ts, but using the Workers `connect()` socket API instead of Node's `net`.
// This is a deploy target for the CheerpJ socket relay (and the WasmGC transport)
// that needs no server to run — Workers can open outbound TCP to :43594.

interface Env {
	/** Optional allowlist override, same syntax as GATEWAY_ALLOW (see allowlist.ts). */
	readonly GATEWAY_ALLOW?: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (request.method === "GET" && url.pathname === "/health") {
			return new Response("ok", { headers: { "content-type": "text/plain" } });
		}
		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("expected a WebSocket upgrade", { status: 426 });
		}

		const host = url.searchParams.get("host") ?? "";
		const port = Number(url.searchParams.get("port"));
		const rules = env.GATEWAY_ALLOW ? parseRules(env.GATEWAY_ALLOW) : DEFAULT_RULES;
		if (!isAllowed(host, port, rules)) {
			return new Response("destination not allowed", { status: 403 });
		}

		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];
		server.accept();
		relay(server, host, port);
		return new Response(null, { status: 101, webSocket: client });
	},
};

/** Bridges an accepted server WebSocket to a fresh TCP socket, both ways. */
function relay(ws: WebSocket, host: string, port: number): void {
	const socket = connect({ hostname: host, port });
	const writer = socket.writable.getWriter();

	ws.addEventListener("message", (event) => {
		// Blind relay: forward binary frames verbatim; ignore text.
		if (typeof event.data !== "string") {
			void writer.write(new Uint8Array(event.data));
		}
	});
	ws.addEventListener("close", () => void socket.close().catch(() => undefined));
	ws.addEventListener("error", () => void socket.close().catch(() => undefined));

	// TCP -> WebSocket.
	void (async () => {
		const reader = socket.readable.getReader();
		try {
			for (;;) {
				// oxlint-disable-next-line no-await-in-loop -- streaming read, inherently sequential
				const { value, done } = await reader.read();
				if (done) {
					break;
				}
				trySend(ws, value);
			}
		} catch {
			// upstream read error; fall through to close
		} finally {
			tryClose(ws, 1000);
		}
	})();
}

function trySend(ws: WebSocket, value: Uint8Array): void {
	try {
		ws.send(value);
	} catch {
		// client gone
	}
}

function tryClose(ws: WebSocket, code: number): void {
	try {
		ws.close(code);
	} catch {
		// already closed
	}
}

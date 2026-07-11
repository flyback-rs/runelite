import { createServer, type Server } from "node:http";
import net from "node:net";
import { type AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { type AllowRule, DEFAULT_RULES, isAllowed } from "./allowlist.ts";

export interface GatewayOptions {
	readonly rules?: readonly AllowRule[];
	/** Max concurrent relays per client IP. */
	readonly maxConnectionsPerIp?: number;
}

/**
 * Creates a blind byte relay: each WebSocket connection to `/connect?host=&port=`
 * is bridged to a TCP socket to that destination (subject to the allowlist), and
 * bytes are piped both ways verbatim. Payloads are never inspected or logged.
 */
export function createGateway(options: GatewayOptions = {}): Server {
	const rules = options.rules ?? DEFAULT_RULES;
	const maxPerIp = options.maxConnectionsPerIp ?? 8;
	const perIp = new Map<string, number>();

	const http = createServer((req, res) => {
		if (req.method === "GET" && req.url === "/health") {
			res.writeHead(200, { "content-type": "text/plain" });
			res.end("ok");
			return;
		}
		res.writeHead(426, { "content-type": "text/plain" });
		res.end("upgrade required");
	});

	const wss = new WebSocketServer({ server: http, maxPayload: 1 << 20 });

	wss.on("connection", (ws, req) => {
		const ip = req.socket.remoteAddress ?? "unknown";
		const active = perIp.get(ip) ?? 0;
		if (active >= maxPerIp) {
			ws.close(1013, "too many connections");
			return;
		}
		perIp.set(ip, active + 1);
		let released = false;
		const release = (): void => {
			if (!released) {
				released = true;
				perIp.set(ip, Math.max(0, (perIp.get(ip) ?? 1) - 1));
			}
		};

		const url = new URL(req.url ?? "", "http://localhost");
		const host = url.searchParams.get("host") ?? "";
		const port = Number(url.searchParams.get("port"));
		if (!isAllowed(host, port, rules)) {
			ws.close(1008, "destination not allowed");
			release();
			return;
		}

		const tcp = net.connect({ host, port });
		tcp.on("data", (chunk) => {
			if (ws.readyState === ws.OPEN) {
				ws.send(chunk);
			}
		});
		tcp.on("close", () => ws.close(1000));
		tcp.on("error", () => ws.close(1011, "upstream error"));

		ws.on("message", (data: Buffer, isBinary: boolean) => {
			// Blind relay: forward binary frames verbatim; ignore text frames.
			if (isBinary && !tcp.destroyed) {
				tcp.write(data);
			}
		});
		ws.on("close", () => {
			tcp.destroy();
			release();
		});
		ws.on("error", () => {
			tcp.destroy();
			release();
		});
	});

	return http;
}

/** Convenience for tests/callers: listen on a port and resolve the bound port. */
export function listen(server: Server, port: number, host = "127.0.0.1"): Promise<number> {
	return new Promise((resolve) => {
		server.listen(port, host, () => resolve((server.address() as AddressInfo).port));
	});
}

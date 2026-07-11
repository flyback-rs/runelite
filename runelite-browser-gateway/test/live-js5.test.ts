import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createGateway, listen } from "../src/gateway.ts";

// Network-gated: proves the relay reaches the real Jagex JS5 service. It performs
// the JS5 connect handshake (opcode 15 + client revision) and expects a status
// byte back — read-only, no login. Enable with LIVE_JS5=1.
const LIVE = process.env["LIVE_JS5"] === "1";
const WORLD = process.env["LIVE_JS5_WORLD"] ?? "oldschool1.runescape.com";
const REVISION = Number(process.env["LIVE_JS5_REVISION"] ?? "230");

describe.skipIf(!LIVE)("live JS5 relay", () => {
	it("relays a JS5 handshake to a real OSRS world and gets a status byte", async () => {
		const gateway = createGateway();
		const port = await listen(gateway, 0);
		const ws = new WebSocket(`ws://127.0.0.1:${port}/connect?host=${WORLD}&port=43594`);
		ws.binaryType = "arraybuffer";

		const status = await new Promise<number>((resolve, reject) => {
			ws.on("open", () => {
				const handshake = Buffer.alloc(5);
				handshake[0] = 15; // JS5 connection type
				handshake.writeUInt32BE(REVISION >>> 0, 1);
				ws.send(handshake);
			});
			ws.on("message", (data) => resolve(new Uint8Array(data as ArrayBuffer)[0] ?? -1));
			ws.on("close", (code) => reject(new Error(`closed before reply: ${code}`)));
			ws.on("error", reject);
			setTimeout(() => reject(new Error("timeout")), 10_000);
		}).finally(() => {
			ws.close();
			gateway.close();
		});

		// 0 = accepted; 6 = out-of-date revision. Either proves bytes reached Jagex.
		expect([0, 6]).toContain(status);
	});
});

import net, { type AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createGateway, listen } from "../src/gateway.ts";

let echo: net.Server;
let echoPort: number;
let gateway: ReturnType<typeof createGateway>;
let gatewayPort: number;

beforeAll(async () => {
	echo = net.createServer((socket) => socket.pipe(socket));
	echoPort = await new Promise<number>((resolve) =>
		echo.listen(0, "127.0.0.1", () => resolve((echo.address() as AddressInfo).port)),
	);
	gateway = createGateway({ rules: [{ host: /^127\.0\.0\.1$/, port: echoPort }] });
	gatewayPort = await listen(gateway, 0);
});

afterAll(() => {
	echo.close();
	gateway.close();
});

function open(query: string): WebSocket {
	const ws = new WebSocket(`ws://127.0.0.1:${gatewayPort}/connect?${query}`);
	ws.binaryType = "arraybuffer";
	return ws;
}

describe("gateway relay", () => {
	it("pipes bytes both ways to the TCP destination", async () => {
		const ws = open(`host=127.0.0.1&port=${echoPort}`);
		const echoed = await new Promise<Uint8Array>((resolve, reject) => {
			ws.on("open", () => ws.send(new Uint8Array([10, 20, 30, 40, 50])));
			ws.on("message", (data) => resolve(new Uint8Array(data as ArrayBuffer)));
			ws.on("error", reject);
			setTimeout(() => reject(new Error("timeout")), 3000);
		});
		ws.close();
		expect([...echoed]).toEqual([10, 20, 30, 40, 50]);
	});

	it("closes with 1008 for a destination not on the allowlist", async () => {
		const ws = open("host=evil.example.com&port=43594");
		const code = await new Promise<number>((resolve) => {
			ws.on("close", (closeCode) => resolve(closeCode));
			ws.on("error", () => undefined);
		});
		expect(code).toBe(1008);
	});

	it("closes with 1008 for a port not on the allowlist", async () => {
		const ws = open("host=127.0.0.1&port=9999");
		const code = await new Promise<number>((resolve) => {
			ws.on("close", (closeCode) => resolve(closeCode));
			ws.on("error", () => undefined);
		});
		expect(code).toBe(1008);
	});
});

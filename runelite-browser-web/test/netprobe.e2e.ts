/* oxlint-disable no-await-in-loop -- polling the gateway's health is sequential by nature */
import { type ChildProcess, spawn } from "node:child_process";
import http from "node:http";
import net, { type AddressInfo } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// End-to-end proof of the browser networking path: the page loads the WasmGC
// module and drives the real Java WebSocketDuplexStream, which opens a WebSocket
// to the gateway (spawned here from its TypeScript source), which relays bytes to
// a TCP echo server. A clean round-trip exercises every layer.
const gatewayEntry = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../runelite-browser-gateway/src/serve.ts",
);

let echo: net.Server;
let echoPort: number;
let gateway: ChildProcess | undefined;
let gatewayPort: number;

function freePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const probe = net.createServer();
		probe.once("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const { port } = probe.address() as AddressInfo;
			probe.close(() => resolvePort(port));
		});
	});
}

function healthy(port: number): Promise<boolean> {
	return new Promise((resolveHealthy) => {
		const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
			res.resume();
			resolveHealthy(res.statusCode === 200);
		});
		req.on("error", () => resolveHealthy(false));
	});
}

async function waitForHealth(port: number, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await healthy(port)) {
			return;
		}
		await new Promise((tick) => setTimeout(tick, 100));
	}
	throw new Error(`gateway did not become healthy on :${port}`);
}

test.beforeAll(async () => {
	echo = net.createServer((socket) => socket.pipe(socket));
	echoPort = await new Promise<number>((resolvePort) =>
		echo.listen(0, "127.0.0.1", () => resolvePort((echo.address() as AddressInfo).port)),
	);
	gatewayPort = await freePort();
	gateway = spawn(process.execPath, [gatewayEntry], {
		env: {
			...process.env,
			PORT: String(gatewayPort),
			HOST: "127.0.0.1",
			GATEWAY_ALLOW: "127.0.0.1:*",
		},
		stdio: "ignore",
	});
	await waitForHealth(gatewayPort, 15_000);
});

test.afterAll(() => {
	echo?.close();
	gateway?.kill();
});

test("WasmGC WebSocket transport round-trips bytes through the gateway", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(String(error)));

	await page.goto("/netprobe.html");
	await page.waitForFunction(() => window.__netprobe?.ready === true, undefined, {
		timeout: 40_000,
	});
	expect(await page.evaluate(() => window.__netprobe?.error ?? null)).toBeNull();

	const payload = "10,20,30,40,50";
	await page.evaluate(
		(args) => window.__netprobe?.start(args.url, args.host, args.port, args.message),
		{ url: `ws://127.0.0.1:${gatewayPort}`, host: "127.0.0.1", port: echoPort, message: payload },
	);

	const settled = await page.waitForFunction(
		() => {
			const status = window.__netprobe?.result() ?? "";
			return status.startsWith("ok:") || status.startsWith("error:") ? status : false;
		},
		undefined,
		{ timeout: 15_000 },
	);
	expect(await settled.jsonValue()).toBe(`ok:${payload}`);
	expect(errors).toEqual([]);
});

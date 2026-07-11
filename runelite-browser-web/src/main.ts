import type { BackendPreference } from "./backends/create.ts";
import type { GameIn, GameOut, RenderIn, RenderOut } from "./protocol.ts";

declare const __DEV__: boolean;

import { buildShell, type EngineStatus, installPanelHost, updateHud } from "./shell.ts";
import { Ring } from "./transport/ring.ts";

// Ring slot size must be >= the Java GameWorker.FRAME_CAPACITY (1 << 16).
const SLOT_SIZE = 1 << 16;
const POINTER_THROTTLE_MS = 33;

const status: EngineStatus = {
	backend: "",
	ready: false,
	frameCount: 0,
	medianMs: 0,
	sample: null,
	batchCount: 0,
	glyphCount: 0,
	glyphAtlas: false,
	uiLayer: false,
	error: null,
};
window.__runelite = status;

main();

function main(): void {
	const shell = buildShell();
	const publishPanel = installPanelHost(shell.sidebar);

	const width = Math.max(1, shell.canvas.clientWidth || 800);
	const height = Math.max(1, shell.canvas.clientHeight || 600);

	const ring = Ring.create(SLOT_SIZE, 3);
	const offscreen = shell.canvas.transferControlToOffscreen();

	const renderWorker = new Worker(new URL("./render.worker.js", import.meta.url), {
		type: "module",
	});
	const gameWorker = new Worker(new URL("./game.worker.js", import.meta.url), { type: "module" });

	renderWorker.addEventListener("message", (event: MessageEvent<RenderOut>) => {
		const message = event.data;
		if (message.type === "ready") {
			status.ready = true;
			status.backend = message.backend;
			sendUiLayer(renderWorker, shell.canvas);
		} else if (message.type === "stats") {
			status.frameCount = message.frameCount;
			status.medianMs = message.medianMs;
			status.sample = message.sample;
			status.batchCount = message.batchCount;
			status.glyphCount = message.glyphCount;
			status.glyphAtlas = message.glyphAtlas;
			status.uiLayer = message.uiLayer;
			updateHud(shell.hud, status);
		} else {
			status.error = message.message;
			updateHud(shell.hud, status);
		}
	});
	gameWorker.addEventListener("message", (event: MessageEvent<GameOut>) => {
		if (event.data.type === "error") {
			status.error = event.data.message;
			updateHud(shell.hud, status);
		}
	});

	const renderInit: RenderIn = {
		type: "init",
		canvas: offscreen,
		ring: ring.description,
		width,
		height,
		backend: backendPreference(),
	};
	renderWorker.postMessage(renderInit, [offscreen]);

	const gameInit: GameIn = {
		type: "init",
		ring: ring.description,
		runtimeUrl: new URL("./runelite-browser.wasm-runtime.js", import.meta.url).href,
		wasmUrl: new URL("./runelite-browser.wasm", import.meta.url).href,
		width,
		height,
	};
	gameWorker.postMessage(gameInit);

	wireInput(shell.canvas, gameWorker);
	wireResize(shell.canvas, renderWorker, gameWorker);
	publishPanel(
		"runelite-browser",
		JSON.stringify({
			pluginId: "runelite-browser",
			title: "RuneLite Browser Engine",
			components: [
				{ type: "SECTION", id: null, text: "Renderer", value: null },
				{ type: "LABEL", id: null, text: "Status", value: "running" },
			],
		}),
	);
	void registerServiceWorker();
}

function backendPreference(): BackendPreference {
	const value = new URLSearchParams(location.search).get("backend");
	return value === "webgpu" || value === "webgl2" ? value : "auto";
}

function wireInput(canvas: HTMLCanvasElement, gameWorker: Worker): void {
	let lastPointer = 0;
	canvas.addEventListener("pointermove", (event) => {
		const now = performance.now();
		if (now - lastPointer < POINTER_THROTTLE_MS) {
			return;
		}
		lastPointer = now;
		gameWorker.postMessage({
			type: "pointer",
			x: event.offsetX,
			y: event.offsetY,
			buttons: event.buttons,
		} satisfies GameIn);
	});
	canvas.addEventListener("pointerdown", (event) => {
		gameWorker.postMessage({
			type: "pointer",
			x: event.offsetX,
			y: event.offsetY,
			buttons: event.buttons,
		} satisfies GameIn);
	});
	canvas.addEventListener("wheel", (event) => {
		gameWorker.postMessage({ type: "wheel", dy: event.deltaY } satisfies GameIn);
	});
	window.addEventListener("keydown", (event) => {
		gameWorker.postMessage({ type: "key", code: event.code, down: true } satisfies GameIn);
	});
	window.addEventListener("keyup", (event) => {
		gameWorker.postMessage({ type: "key", code: event.code, down: false } satisfies GameIn);
	});
}

function wireResize(canvas: HTMLCanvasElement, renderWorker: Worker, gameWorker: Worker): void {
	// The first callback fires with the post-layout size, correcting the
	// pre-layout default the workers were initialised with.
	const observer = new ResizeObserver((entries) => {
		const entry = entries[0];
		if (!entry) {
			return;
		}
		const width = Math.max(1, Math.round(entry.contentRect.width));
		const height = Math.max(1, Math.round(entry.contentRect.height));
		renderWorker.postMessage({ type: "resize", width, height } satisfies RenderIn);
		gameWorker.postMessage({ type: "resize", width, height } satisfies GameIn);
		sendUiLayer(renderWorker, canvas);
	});
	observer.observe(canvas);
}

/**
 * Renders a synthetic client-style UI layer (frame border, chatbox panel,
 * minimap ring — centre kept clear so the 3D scene stays visible/verifiable)
 * and posts its pixels to the render worker for compositing. This stands in for
 * the real client framebuffer, which will arrive through the same message from
 * the CheerpJ interop (`BufferProvider.getPixels()`).
 */
function sendUiLayer(renderWorker: Worker, canvas: HTMLCanvasElement): void {
	const width = Math.max(1, canvas.clientWidth || 800);
	const height = Math.max(1, canvas.clientHeight || 600);
	const layer = new OffscreenCanvas(width, height);
	const ctx = layer.getContext("2d", { willReadFrequently: true });
	if (!ctx) {
		return;
	}

	// Frame border.
	ctx.strokeStyle = "rgba(94, 84, 65, 0.9)";
	ctx.lineWidth = 4;
	ctx.strokeRect(2, 2, width - 4, height - 4);

	// Chatbox panel, bottom-left.
	const boxW = Math.min(320, width - 24);
	const boxH = 96;
	ctx.fillStyle = "rgba(20, 18, 14, 0.72)";
	ctx.fillRect(8, height - boxH - 8, boxW, boxH);
	ctx.strokeStyle = "rgba(94, 84, 65, 0.9)";
	ctx.lineWidth = 2;
	ctx.strokeRect(8, height - boxH - 8, boxW, boxH);

	// Minimap ring, top-right.
	ctx.beginPath();
	ctx.arc(width - 56, 56, 40, 0, Math.PI * 2);
	ctx.strokeStyle = "rgba(94, 84, 65, 0.9)";
	ctx.lineWidth = 3;
	ctx.stroke();

	const image = ctx.getImageData(0, 0, width, height);
	const message: RenderIn = { type: "ui", width, height, pixels: image.data.buffer };
	renderWorker.postMessage(message, [image.data.buffer]);
}

async function registerServiceWorker(): Promise<void> {
	// The service worker caches the app shell; skip it in dev so edits aren't
	// masked by a stale cache (build.mjs defines __DEV__).
	if (__DEV__ || !("serviceWorker" in navigator)) {
		return;
	}
	try {
		await navigator.serviceWorker.register(new URL("./sw.js", import.meta.url), { type: "module" });
	} catch (error) {
		console.warn("[shell] service worker registration failed:", error);
	}
}

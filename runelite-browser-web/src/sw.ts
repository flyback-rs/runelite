// Minimal PWA service worker: precache the app shell and serve network-first
// (so a redeploy is picked up immediately) with a cache fallback for offline. A
// starting point for the PWA-hardening part of the port.
const ctx = self as unknown as ServiceWorkerGlobalScope;

const CACHE = "runelite-browser-v1";
const SHELL = ["./", "./index.html", "./main.js", "./manifest.webmanifest"];

ctx.addEventListener("install", (event: ExtendableEvent) => {
	event.waitUntil(precache().then(() => ctx.skipWaiting()));
});

ctx.addEventListener("activate", (event: ExtendableEvent) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
			)
			.then(() => ctx.clients.claim()),
	);
});

ctx.addEventListener("fetch", (event: FetchEvent) => {
	if (event.request.method !== "GET") {
		return;
	}
	event.respondWith(networkFirst(event.request));
});

/** Caches shell assets individually so one 404 doesn't fail the whole install. */
async function precache(): Promise<void> {
	const cache = await caches.open(CACHE);
	await Promise.all(
		SHELL.map(async (url) => {
			try {
				await cache.add(url);
			} catch {
				// Best effort: a missing asset must not block activation.
			}
		}),
	);
}

async function networkFirst(request: Request): Promise<Response> {
	try {
		const response = await fetch(request);
		if (response.ok && new URL(request.url).origin === location.origin) {
			const cache = await caches.open(CACHE);
			await cache.put(request, response.clone());
		}
		return response;
	} catch (error) {
		const cached = await caches.match(request);
		if (cached) {
			return cached;
		}
		throw error;
	}
}

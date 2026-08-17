// Minimal PWA service worker: precache the app shell and serve cache-first with
// a network fallback. A starting point for the PWA-hardening part of the port.
const ctx = self as unknown as ServiceWorkerGlobalScope;

const CACHE = "runelite-browser-v1";
const SHELL = ["./", "./index.html", "./main.js", "./manifest.webmanifest"];

ctx.addEventListener("install", (event: ExtendableEvent) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(SHELL))
			.then(() => ctx.skipWaiting()),
	);
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
	event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request: Request): Promise<Response> {
	const cached = await caches.match(request);
	if (cached) {
		return cached;
	}
	const response = await fetch(request);
	if (response.ok && new URL(request.url).origin === location.origin) {
		const cache = await caches.open(CACHE);
		cache.put(request, response.clone());
	}
	return response;
}

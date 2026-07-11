import { expect, test } from "@playwright/test";
/* oxlint-disable no-await-in-loop -- sequential polling is intentional */
import type { EngineStatus } from "../src/shell.ts";

// Clear colour is ~[15, 18, 23]; a pixel far from it means geometry was drawn.
function isNonBackground(sample: number[]): boolean {
	const [r = 0, g = 0, b = 0] = sample;
	return Math.abs(r - 15) + Math.abs(g - 18) + Math.abs(b - 23) > 40;
}

test("engine boots, renders and animates in a worker", async ({ page }, testInfo) => {
	const backend = testInfo.project.name;
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(String(error)));

	await page.goto(`/?backend=${backend}`);
	await page.waitForFunction(() => window.__runelite?.ready === true, undefined, {
		timeout: 40_000,
	});

	// SharedArrayBuffer requires cross-origin isolation.
	expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
	expect(await page.evaluate(() => window.__runelite?.backend)).toBe(backend);

	// The render loop advances without stalling the main thread.
	const before = await page.evaluate(() => window.__runelite?.frameCount ?? 0);
	await page.waitForTimeout(1000);
	const status = await page.evaluate(() => ({ ...window.__runelite }) as EngineStatus);
	expect(status.error).toBeNull();
	expect(status.frameCount).toBeGreaterThan(before);

	if (backend === "webgl2") {
		// WebGL2 supports synchronous readback: verify the scene is drawn
		// (non-background) and animated (the sampled pixel changes as the cube
		// rotates). Poll until two distinct samples are seen, or time out.
		const distinct = new Map<string, number[]>();
		const deadline = Date.now() + 15_000;
		while (Date.now() < deadline && distinct.size < 2) {
			const sample = await page.evaluate(() => window.__runelite?.sample ?? null);
			if (sample) {
				distinct.set(sample.join(","), sample);
			}
			await page.waitForTimeout(120);
		}
		const samples = [...distinct.values()];
		expect(samples.some(isNonBackground)).toBe(true);
		expect(distinct.size).toBeGreaterThan(1);
	}

	expect(errors).toEqual([]);
});

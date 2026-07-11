import { describe, expect, it } from "vitest";
import { Ring } from "../src/transport/ring.ts";

describe("Ring", () => {
	it("returns null before anything is committed", () => {
		const ring = Ring.create(64, 3);
		expect(ring.readLatest()).toBeNull();
	});

	it("round-trips a committed frame and then reports no new frame", () => {
		const ring = Ring.create(64, 3);
		const { payload } = ring.acquireWrite();
		payload.set([1, 2, 3, 4]);
		ring.commit(4);

		const frame = ring.readLatest();
		expect(frame).not.toBeNull();
		expect(frame!.sequence).toBe(1);
		expect(frame!.length).toBe(4);
		expect([...frame!.data]).toEqual([1, 2, 3, 4]);

		// Nothing newer since the last read.
		expect(ring.readLatest()).toBeNull();
	});

	it("delivers the newest frame and survives wrap-around past slotCount", () => {
		const ring = Ring.create(16, 3);
		for (let seq = 1; seq <= 7; seq++) {
			const { payload } = ring.acquireWrite();
			payload.set([seq, seq + 100]);
			ring.commit(2);
		}
		const frame = ring.readLatest();
		expect(frame).not.toBeNull();
		expect(frame!.sequence).toBe(7);
		expect([...frame!.data]).toEqual([7, 107]);
	});

	it("rejects a committed length larger than the slot", () => {
		const ring = Ring.create(16, 3);
		ring.acquireWrite();
		expect(() => ring.commit(17)).toThrow(/exceeds slot size/);
	});

	it("attaches to an existing shared buffer with the same view of data", () => {
		const producer = Ring.create(32, 3);
		const consumer = Ring.attach(producer.description);

		const { payload } = producer.acquireWrite();
		payload.set([9, 8, 7]);
		producer.commit(3);

		const frame = consumer.readLatest();
		expect(frame).not.toBeNull();
		expect([...frame!.data]).toEqual([9, 8, 7]);
	});
});

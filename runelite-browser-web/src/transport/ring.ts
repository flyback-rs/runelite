/**
 * A lock-free, latest-wins ring buffer over a {@link SharedArrayBuffer} for
 * handing packed frames from the game worker to the render worker without
 * copying between threads or blocking the render loop.
 *
 * Each slot carries a seqlock: the producer stamps an odd (writing) sequence,
 * fills the payload, then stamps the final even sequence. The consumer reads the
 * published sequence, reads the slot, and re-checks the stamp; a torn read is
 * simply skipped (the renderer reuses the previous frame). Three slots keep the
 * producer far enough ahead of the consumer to avoid overwriting a slot mid-read.
 */

const CONTROL_INT32S = 1; // [publishedSeq]
const SLOT_HEADER_INT32S = 2; // [seq, length]

export interface RingFrame {
	readonly data: Uint8Array;
	readonly length: number;
	readonly sequence: number;
}

export interface RingLayout {
	readonly sab: SharedArrayBuffer;
	readonly slotSize: number;
	readonly slotCount: number;
}

export class Ring {
	private readonly control: Int32Array;
	private readonly slotSeq: Int32Array;
	private readonly bytes: Uint8Array;
	private readonly slotStride: number;
	private readonly payloadOffset: number;

	private writeSeq = 0;
	private lastRead = 0;

	private constructor(private readonly layout: RingLayout) {
		const slotHeaderBytes = SLOT_HEADER_INT32S * 4;
		this.control = new Int32Array(layout.sab, 0, CONTROL_INT32S);
		this.slotSeq = new Int32Array(layout.sab, CONTROL_INT32S * 4);
		this.slotStride = slotHeaderBytes + align4(layout.slotSize);
		this.payloadOffset = slotHeaderBytes;
		this.bytes = new Uint8Array(layout.sab);
	}

	/** Bytes a SharedArrayBuffer must have for the given geometry. */
	static byteLength(slotSize: number, slotCount: number): number {
		const slotHeaderBytes = SLOT_HEADER_INT32S * 4;
		return CONTROL_INT32S * 4 + slotCount * (slotHeaderBytes + align4(slotSize));
	}

	/** Allocates a new ring (call on the thread that owns both workers). */
	static create(slotSize: number, slotCount = 3): Ring {
		const sab = new SharedArrayBuffer(Ring.byteLength(slotSize, slotCount));
		return new Ring({ sab, slotSize, slotCount });
	}

	/** Attaches to an existing ring inside a worker. */
	static attach(layout: RingLayout): Ring {
		return new Ring(layout);
	}

	get sharedBuffer(): SharedArrayBuffer {
		return this.layout.sab;
	}

	get description(): RingLayout {
		return this.layout;
	}

	private slotIndex(seq: number): number {
		return seq % this.layout.slotCount;
	}

	private seqField(slot: number): number {
		return (slot * this.slotStride) >> 2;
	}

	private lenField(slot: number): number {
		return this.seqField(slot) + 1;
	}

	private payloadStart(slot: number): number {
		// slotSeq / control indices are relative to the post-control region, so
		// absolute byte offsets into `bytes` must include the control header.
		return CONTROL_INT32S * 4 + slot * this.slotStride + this.payloadOffset;
	}

	/**
	 * Returns a writable view over the next slot's payload for the producer to
	 * fill; follow with {@link commit}.
	 */
	acquireWrite(): { slot: number; payload: Uint8Array } {
		const seq = this.writeSeq + 1;
		const slot = this.slotIndex(seq);
		Atomics.store(this.slotSeq, this.seqField(slot), -1); // mark writing
		const start = this.payloadStart(slot);
		return { slot, payload: this.bytes.subarray(start, start + this.layout.slotSize) };
	}

	/** Publishes the slot filled by {@link acquireWrite}. */
	commit(length: number): void {
		const seq = this.writeSeq + 1;
		const slot = this.slotIndex(seq);
		Atomics.store(this.slotSeq, this.lenField(slot), length);
		Atomics.store(this.slotSeq, this.seqField(slot), seq);
		this.writeSeq = seq;
		Atomics.store(this.control, 0, seq);
		Atomics.notify(this.control, 0);
	}

	/**
	 * Returns the newest committed frame, or {@code null} if there is nothing
	 * newer than the last returned frame or the read tore.
	 */
	readLatest(): RingFrame | null {
		const seq = Atomics.load(this.control, 0);
		if (seq <= this.lastRead) {
			return null;
		}
		const slot = this.slotIndex(seq);
		const before = Atomics.load(this.slotSeq, this.seqField(slot));
		if (before !== seq) {
			return null;
		}
		const length = Atomics.load(this.slotSeq, this.lenField(slot));
		const start = this.payloadStart(slot);
		const data = this.bytes.slice(start, start + length);
		const after = Atomics.load(this.slotSeq, this.seqField(slot));
		if (after !== seq) {
			return null;
		}
		this.lastRead = seq;
		return { data, length, sequence: seq };
	}
}

function align4(n: number): number {
	return (n + 3) & ~3;
}

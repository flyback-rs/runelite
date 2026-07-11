import { type Frame, VERTEX_STRIDE } from "../scene/command-buffer.ts";
import overlayShader from "../shaders/overlay.wgsl";
import sceneShader from "../shaders/scene.wgsl";
import { type Backend, CLEAR_COLOR, unpackRgba } from "./types.ts";

const CAMERA_BYTES = 144; // mat4 + mat4 + f32, padded to 16
const VERTEX_CAPACITY = 1 << 16;
const OVERLAY_STRIDE = 256; // >= minUniformBufferOffsetAlignment
const MAX_OVERLAYS = 64;
const DEPTH_FORMAT: GPUTextureFormat = "depth24plus";

/** Renders frames with WebGPU (the preferred backend when available). */
export class GpuBackend implements Backend {
	readonly name = "webgpu" as const;

	private width: number;
	private height: number;
	private depth: GPUTexture;
	private readonly cameraData = new Float32Array(CAMERA_BYTES / 4);
	private readonly overlayData = new Float32Array((OVERLAY_STRIDE * MAX_OVERLAYS) / 4);

	private constructor(
		private readonly device: GPUDevice,
		private readonly context: GPUCanvasContext,
		private readonly scenePipeline: GPURenderPipeline,
		private readonly sceneBindGroup: GPUBindGroup,
		private readonly cameraBuffer: GPUBuffer,
		private readonly vertexBuffer: GPUBuffer,
		private readonly overlayPipeline: GPURenderPipeline,
		private readonly overlayBindGroup: GPUBindGroup,
		private readonly overlayBuffer: GPUBuffer,
		width: number,
		height: number,
	) {
		this.width = width;
		this.height = height;
		this.depth = this.createDepth();
	}

	static async create(
		canvas: OffscreenCanvas,
		width: number,
		height: number,
	): Promise<GpuBackend | null> {
		if (!navigator.gpu) {
			return null;
		}
		const adapter = await navigator.gpu.requestAdapter();
		if (!adapter) {
			return null;
		}
		const device = await adapter.requestDevice();
		const context = canvas.getContext("webgpu");
		if (!context) {
			return null;
		}
		const format = navigator.gpu.getPreferredCanvasFormat();
		context.configure({ device, format, alphaMode: "opaque" });

		const cameraBuffer = device.createBuffer({
			size: CAMERA_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		const vertexBuffer = device.createBuffer({
			size: VERTEX_CAPACITY,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		const overlayBuffer = device.createBuffer({
			size: OVERLAY_STRIDE * MAX_OVERLAYS,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

		const sceneModule = device.createShaderModule({ code: sceneShader });
		const scenePipeline = device.createRenderPipeline({
			layout: "auto",
			vertex: {
				module: sceneModule,
				entryPoint: "vs_main",
				buffers: [
					{
						arrayStride: 24,
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x3" },
							{ shaderLocation: 1, offset: 12, format: "uint32" },
						],
					},
				],
			},
			fragment: { module: sceneModule, entryPoint: "fs_main", targets: [{ format }] },
			primitive: { topology: "triangle-list", cullMode: "none" },
			depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: "greater" },
		});
		const sceneBindGroup = device.createBindGroup({
			layout: scenePipeline.getBindGroupLayout(0),
			entries: [{ binding: 0, resource: { buffer: cameraBuffer } }],
		});

		const overlayModule = device.createShaderModule({ code: overlayShader });
		const overlayLayout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: 48 },
				},
			],
		});
		const overlayPipeline = device.createRenderPipeline({
			layout: device.createPipelineLayout({ bindGroupLayouts: [overlayLayout] }),
			vertex: { module: overlayModule, entryPoint: "vs_main" },
			fragment: {
				module: overlayModule,
				entryPoint: "fs_main",
				targets: [
					{
						format,
						blend: {
							color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
							alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
						},
					},
				],
			},
			primitive: { topology: "triangle-strip" },
			// Compatible with the pass's depth attachment, but never writes depth.
			depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "always" },
		});
		const overlayBindGroup = device.createBindGroup({
			layout: overlayLayout,
			entries: [
				{ binding: 0, resource: { buffer: overlayBuffer, offset: 0, size: OVERLAY_STRIDE } },
			],
		});

		return new GpuBackend(
			device,
			context,
			scenePipeline,
			sceneBindGroup,
			cameraBuffer,
			vertexBuffer,
			overlayPipeline,
			overlayBindGroup,
			overlayBuffer,
			width,
			height,
		);
	}

	private createDepth(): GPUTexture {
		return this.device.createTexture({
			size: { width: Math.max(1, this.width), height: Math.max(1, this.height) },
			format: DEPTH_FORMAT,
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
	}

	resize(width: number, height: number): void {
		this.width = width;
		this.height = height;
		this.depth.destroy();
		this.depth = this.createDepth();
	}

	render(frame: Frame): void {
		const encoder = this.device.createCommandEncoder();
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.context.getCurrentTexture().createView(),
					clearValue: {
						r: CLEAR_COLOR[0],
						g: CLEAR_COLOR[1],
						b: CLEAR_COLOR[2],
						a: CLEAR_COLOR[3],
					},
					loadOp: "clear",
					storeOp: "store",
				},
			],
			depthStencilAttachment: {
				view: this.depth.createView(),
				depthClearValue: 0, // reversed-Z: far = 0
				depthLoadOp: "clear",
				depthStoreOp: "store",
			},
		});

		if (frame.camera && frame.vertices && frame.batches.length > 0) {
			this.cameraData.set(frame.camera.worldProj, 0);
			this.cameraData.set(frame.camera.entityProj, 16);
			this.cameraData[32] = frame.camera.brightness || 1;
			this.device.queue.writeBuffer(this.cameraBuffer, 0, this.cameraData);
			const uploadBytes = Math.min(frame.vertices.byteLength, VERTEX_CAPACITY);
			this.device.queue.writeBuffer(this.vertexBuffer, 0, frame.vertices, 0, uploadBytes);
			// Only what fit in the fixed-size vertex buffer was uploaded; drawing a
			// batch past that range is a WebGPU validation error, so skip it.
			const uploadedVerts = Math.floor(uploadBytes / VERTEX_STRIDE);
			pass.setPipeline(this.scenePipeline);
			pass.setBindGroup(0, this.sceneBindGroup);
			pass.setVertexBuffer(0, this.vertexBuffer);
			for (const batch of frame.batches) {
				if (batch.firstVertex + batch.vertexCount <= uploadedVerts) {
					pass.draw(batch.vertexCount, 1, batch.firstVertex, 0);
				}
			}
		}

		const overlays = frame.overlays.slice(0, MAX_OVERLAYS);
		if (overlays.length > 0) {
			for (let i = 0; i < overlays.length; i++) {
				const quad = overlays[i]!;
				const base = (i * OVERLAY_STRIDE) / 4;
				this.overlayData[base] = quad.x;
				this.overlayData[base + 1] = quad.y;
				this.overlayData[base + 2] = quad.w;
				this.overlayData[base + 3] = quad.h;
				this.overlayData[base + 4] = this.width;
				this.overlayData[base + 5] = this.height;
				const [r, g, b, a] = unpackRgba(quad.color);
				this.overlayData[base + 8] = r;
				this.overlayData[base + 9] = g;
				this.overlayData[base + 10] = b;
				this.overlayData[base + 11] = a;
			}
			this.device.queue.writeBuffer(
				this.overlayBuffer,
				0,
				this.overlayData,
				0,
				(overlays.length * OVERLAY_STRIDE) / 4,
			);
			pass.setPipeline(this.overlayPipeline);
			for (let i = 0; i < overlays.length; i++) {
				pass.setBindGroup(0, this.overlayBindGroup, [i * OVERLAY_STRIDE]);
				pass.draw(4, 1, 0, 0);
			}
		}

		pass.end();
		this.device.queue.submit([encoder.finish()]);
	}

	dispose(): void {
		this.depth.destroy();
		this.cameraBuffer.destroy();
		this.vertexBuffer.destroy();
		this.overlayBuffer.destroy();
	}
}

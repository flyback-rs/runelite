import { BATCH_TRANSLUCENT, type Frame, VERTEX_STRIDE } from "../scene/command-buffer.ts";
import { buildTextureLayers, MATERIAL_COUNT, TEXTURE_SIZE } from "../scene/textures.ts";
import type { GlyphAtlas } from "../text/atlas.ts";
import { layoutGlyphs } from "../text/atlas.ts";
import glyphShader from "../shaders/glyph.wgsl";
import overlayShader from "../shaders/overlay.wgsl";
import sceneShader from "../shaders/scene.wgsl";
import uiShader from "../shaders/ui.wgsl";
import { type Backend, CLEAR_COLOR, GLYPH_BUFFER_BYTES, unpackRgba } from "./types.ts";

const CAMERA_BYTES = 144; // mat4 + mat4 + f32, padded to 16
const VERTEX_CAPACITY = 1 << 16;
const OVERLAY_STRIDE = 256; // >= minUniformBufferOffsetAlignment
const MAX_OVERLAYS = 64;
const DEPTH_FORMAT: GPUTextureFormat = "depth24plus";

const ALPHA_BLEND: GPUBlendState = {
	color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
	alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
};

/** Pipelines/resources built once at create(). */
interface Resources {
	readonly device: GPUDevice;
	readonly context: GPUCanvasContext;
	readonly format: GPUTextureFormat;
	readonly sceneOpaque: GPURenderPipeline;
	readonly sceneTranslucent: GPURenderPipeline;
	readonly sceneBindGroup: GPUBindGroup;
	readonly cameraBuffer: GPUBuffer;
	readonly vertexBuffer: GPUBuffer;
	readonly overlayPipeline: GPURenderPipeline;
	readonly overlayBindGroup: GPUBindGroup;
	readonly overlayBuffer: GPUBuffer;
	readonly uiPipeline: GPURenderPipeline;
	readonly glyphPipeline: GPURenderPipeline;
	readonly glyphBuffer: GPUBuffer;
	readonly glyphUniforms: GPUBuffer;
	readonly linearSampler: GPUSampler;
}

/** Renders frames with WebGPU (the preferred backend when available). */
export class GpuBackend implements Backend {
	readonly name = "webgpu" as const;

	private width: number;
	private height: number;
	private depth: GPUTexture;
	private readonly cameraData = new Float32Array(CAMERA_BYTES / 4);
	private readonly overlayData = new Float32Array((OVERLAY_STRIDE * MAX_OVERLAYS) / 4);
	private readonly glyphScratch = new DataView(new ArrayBuffer(GLYPH_BUFFER_BYTES));

	private uiTexture: GPUTexture | null = null;
	private uiBindGroup: GPUBindGroup | null = null;
	private glyphAtlas: GlyphAtlas | null = null;
	private glyphBindGroup: GPUBindGroup | null = null;

	private constructor(
		private readonly r: Resources,
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
		const glyphBuffer = device.createBuffer({
			size: GLYPH_BUFFER_BYTES,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		const glyphUniforms = device.createBuffer({
			size: 16,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		const linearSampler = device.createSampler({
			magFilter: "linear",
			minFilter: "linear",
			addressModeU: "repeat",
			addressModeV: "repeat",
		});

		const materials = device.createTexture({
			size: { width: TEXTURE_SIZE, height: TEXTURE_SIZE, depthOrArrayLayers: MATERIAL_COUNT },
			format: "rgba8unorm",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
		});
		device.queue.writeTexture(
			{ texture: materials },
			buildTextureLayers(),
			{ bytesPerRow: TEXTURE_SIZE * 4, rowsPerImage: TEXTURE_SIZE },
			{ width: TEXTURE_SIZE, height: TEXTURE_SIZE, depthOrArrayLayers: MATERIAL_COUNT },
		);

		// Opaque and translucent scene pipelines share this explicit layout so one
		// bind group serves both.
		const sceneLayout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: "uniform" },
				},
				{ binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
				{
					binding: 2,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "float", viewDimension: "2d-array" },
				},
			],
		});
		const sceneModule = device.createShaderModule({ code: sceneShader });
		const sceneVertexState: GPUVertexState = {
			module: sceneModule,
			entryPoint: "vs_main",
			buffers: [
				{
					arrayStride: VERTEX_STRIDE,
					attributes: [
						{ shaderLocation: 0, offset: 0, format: "float32x3" },
						{ shaderLocation: 1, offset: 12, format: "uint32" },
						{ shaderLocation: 2, offset: 16, format: "sint16x4" },
					],
				},
			],
		};
		const scenePipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [sceneLayout] });
		const sceneOpaque = device.createRenderPipeline({
			layout: scenePipelineLayout,
			vertex: sceneVertexState,
			fragment: { module: sceneModule, entryPoint: "fs_main", targets: [{ format }] },
			primitive: { topology: "triangle-list", cullMode: "none" },
			depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: "greater" },
		});
		// Translucent: blended, depth-tested against opaque, no depth writes; the
		// producer emits these batches back-to-front.
		const sceneTranslucent = device.createRenderPipeline({
			layout: scenePipelineLayout,
			vertex: sceneVertexState,
			fragment: {
				module: sceneModule,
				entryPoint: "fs_main",
				targets: [{ format, blend: ALPHA_BLEND }],
			},
			primitive: { topology: "triangle-list", cullMode: "none" },
			depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "greater" },
		});
		const sceneBindGroup = device.createBindGroup({
			layout: sceneLayout,
			entries: [
				{ binding: 0, resource: { buffer: cameraBuffer } },
				{ binding: 1, resource: linearSampler },
				{ binding: 2, resource: materials.createView({ dimension: "2d-array" }) },
			],
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
				targets: [{ format, blend: ALPHA_BLEND }],
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

		const uiModule = device.createShaderModule({ code: uiShader });
		const uiPipeline = device.createRenderPipeline({
			layout: "auto",
			vertex: { module: uiModule, entryPoint: "vs_main" },
			fragment: {
				module: uiModule,
				entryPoint: "fs_main",
				targets: [{ format, blend: ALPHA_BLEND }],
			},
			primitive: { topology: "triangle-strip" },
			depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "always" },
		});

		const glyphModule = device.createShaderModule({ code: glyphShader });
		const glyphPipeline = device.createRenderPipeline({
			layout: "auto",
			vertex: {
				module: glyphModule,
				entryPoint: "vs_main",
				buffers: [
					{
						arrayStride: 20,
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x2" },
							{ shaderLocation: 1, offset: 8, format: "float32x2" },
							{ shaderLocation: 2, offset: 16, format: "unorm8x4" },
						],
					},
				],
			},
			fragment: {
				module: glyphModule,
				entryPoint: "fs_main",
				targets: [{ format, blend: ALPHA_BLEND }],
			},
			primitive: { topology: "triangle-list" },
			depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "always" },
		});

		return new GpuBackend(
			{
				device,
				context,
				format,
				sceneOpaque,
				sceneTranslucent,
				sceneBindGroup,
				cameraBuffer,
				vertexBuffer,
				overlayPipeline,
				overlayBindGroup,
				overlayBuffer,
				uiPipeline,
				glyphPipeline,
				glyphBuffer,
				glyphUniforms,
				linearSampler,
			},
			width,
			height,
		);
	}

	private createDepth(): GPUTexture {
		return this.r.device.createTexture({
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

	setGlyphAtlas(atlas: GlyphAtlas): void {
		const device = this.r.device;
		this.glyphAtlas = atlas;
		const texture = device.createTexture({
			size: { width: atlas.size, height: atlas.size },
			format: "rgba8unorm",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
		});
		device.queue.writeTexture(
			{ texture },
			atlas.pixels,
			{ bytesPerRow: atlas.size * 4 },
			{ width: atlas.size, height: atlas.size },
		);
		this.glyphBindGroup = device.createBindGroup({
			layout: this.r.glyphPipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: this.r.glyphUniforms } },
				{ binding: 1, resource: this.r.linearSampler },
				{ binding: 2, resource: texture.createView() },
			],
		});
	}

	setUiLayer(width: number, height: number, pixels: Uint8Array): void {
		const device = this.r.device;
		if (!this.uiTexture || this.uiTexture.width !== width || this.uiTexture.height !== height) {
			this.uiTexture?.destroy();
			this.uiTexture = device.createTexture({
				size: { width, height },
				format: "rgba8unorm",
				usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
			});
			this.uiBindGroup = device.createBindGroup({
				layout: this.r.uiPipeline.getBindGroupLayout(0),
				entries: [
					{ binding: 0, resource: this.r.linearSampler },
					{ binding: 1, resource: this.uiTexture.createView() },
				],
			});
		}
		device.queue.writeTexture(
			{ texture: this.uiTexture },
			pixels,
			{ bytesPerRow: width * 4 },
			{ width, height },
		);
	}

	render(frame: Frame): void {
		const { device, context } = this.r;
		const encoder = device.createCommandEncoder();
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: context.getCurrentTexture().createView(),
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
			device.queue.writeBuffer(this.r.cameraBuffer, 0, this.cameraData);
			const uploadBytes = Math.min(frame.vertices.byteLength, VERTEX_CAPACITY);
			device.queue.writeBuffer(this.r.vertexBuffer, 0, frame.vertices, 0, uploadBytes);
			// Only what fit in the fixed-size vertex buffer was uploaded; drawing a
			// batch past that range is a WebGPU validation error, so skip it.
			const uploadedVerts = Math.floor(uploadBytes / VERTEX_STRIDE);
			pass.setBindGroup(0, this.r.sceneBindGroup);
			pass.setVertexBuffer(0, this.r.vertexBuffer);
			pass.setPipeline(this.r.sceneOpaque);
			for (const batch of frame.batches) {
				if (
					(batch.flags & BATCH_TRANSLUCENT) === 0 &&
					batch.firstVertex + batch.vertexCount <= uploadedVerts
				) {
					pass.draw(batch.vertexCount, 1, batch.firstVertex, 0);
				}
			}
			pass.setPipeline(this.r.sceneTranslucent);
			for (const batch of frame.batches) {
				if (
					(batch.flags & BATCH_TRANSLUCENT) !== 0 &&
					batch.firstVertex + batch.vertexCount <= uploadedVerts
				) {
					pass.draw(batch.vertexCount, 1, batch.firstVertex, 0);
				}
			}
		}

		if (this.uiBindGroup) {
			pass.setPipeline(this.r.uiPipeline);
			pass.setBindGroup(0, this.uiBindGroup);
			pass.draw(4, 1, 0, 0);
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
			device.queue.writeBuffer(
				this.r.overlayBuffer,
				0,
				this.overlayData,
				0,
				(overlays.length * OVERLAY_STRIDE) / 4,
			);
			pass.setPipeline(this.r.overlayPipeline);
			for (let i = 0; i < overlays.length; i++) {
				pass.setBindGroup(0, this.r.overlayBindGroup, [i * OVERLAY_STRIDE]);
				pass.draw(4, 1, 0, 0);
			}
		}

		if (this.glyphAtlas && this.glyphBindGroup && frame.glyphs.length > 0) {
			const vertexCount = layoutGlyphs(this.glyphAtlas, frame.glyphs, this.glyphScratch);
			if (vertexCount > 0) {
				device.queue.writeBuffer(
					this.r.glyphUniforms,
					0,
					new Float32Array([this.width, this.height, 0, 0]),
				);
				device.queue.writeBuffer(this.r.glyphBuffer, 0, this.glyphScratch, 0, vertexCount * 20);
				pass.setPipeline(this.r.glyphPipeline);
				pass.setBindGroup(0, this.glyphBindGroup);
				pass.setVertexBuffer(0, this.r.glyphBuffer);
				pass.draw(vertexCount, 1, 0, 0);
			}
		}

		pass.end();
		device.queue.submit([encoder.finish()]);
	}

	dispose(): void {
		this.depth.destroy();
		this.uiTexture?.destroy();
		this.r.cameraBuffer.destroy();
		this.r.vertexBuffer.destroy();
		this.r.overlayBuffer.destroy();
		this.r.glyphBuffer.destroy();
		this.r.glyphUniforms.destroy();
	}
}

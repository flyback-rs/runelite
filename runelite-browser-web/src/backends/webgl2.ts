import { BATCH_TRANSLUCENT, type Frame } from "../scene/command-buffer.ts";
import { buildTextureLayers, MATERIAL_COUNT, TEXTURE_SIZE } from "../scene/textures.ts";
import type { GlyphAtlas } from "../text/atlas.ts";
import { layoutGlyphs } from "../text/atlas.ts";
import glyphFrag from "../shaders/glyph.frag.glsl";
import glyphVert from "../shaders/glyph.vert.glsl";
import overlayFrag from "../shaders/overlay.frag.glsl";
import overlayVert from "../shaders/overlay.vert.glsl";
import sceneFrag from "../shaders/scene.frag.glsl";
import sceneVert from "../shaders/scene.vert.glsl";
import uiFrag from "../shaders/ui.frag.glsl";
import uiVert from "../shaders/ui.vert.glsl";
import { type Backend, CLEAR_COLOR, GLYPH_BUFFER_BYTES, unpackRgba } from "./types.ts";

/** Renders frames with WebGL2 (the broadly-supported fallback backend). */
export class Gl2Backend implements Backend {
	readonly name = "webgl2" as const;

	private readonly gl: WebGL2RenderingContext;
	private readonly scene: {
		program: WebGLProgram;
		vao: WebGLVertexArrayObject;
		vbo: WebGLBuffer;
		textures: WebGLTexture;
		uWorldProj: WebGLUniformLocation;
		uEntityProj: WebGLUniformLocation;
		uBrightness: WebGLUniformLocation;
	};
	private readonly overlay: {
		program: WebGLProgram;
		vao: WebGLVertexArrayObject;
		vbo: WebGLBuffer;
		uRect: WebGLUniformLocation;
		uViewport: WebGLUniformLocation;
		uColor: WebGLUniformLocation;
	};
	private readonly ui: {
		program: WebGLProgram;
		vao: WebGLVertexArrayObject;
		vbo: WebGLBuffer;
		texture: WebGLTexture;
		loaded: boolean;
	};
	private readonly glyph: {
		program: WebGLProgram;
		vao: WebGLVertexArrayObject;
		vbo: WebGLBuffer;
		texture: WebGLTexture;
		uViewport: WebGLUniformLocation;
		scratch: DataView;
		atlas: GlyphAtlas | null;
	};
	private width: number;
	private height: number;

	constructor(canvas: OffscreenCanvas, width: number, height: number) {
		const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
		if (!gl) {
			throw new Error("WebGL2 is not available");
		}
		this.gl = gl;
		this.width = width;
		this.height = height;

		const sceneProgram = link(gl, sceneVert, sceneFrag);
		const sceneVao = must(gl.createVertexArray(), "vao");
		const sceneVbo = must(gl.createBuffer(), "vbo");
		gl.bindVertexArray(sceneVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, sceneVbo);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_INT, 24, 12);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribIPointer(2, 4, gl.SHORT, 24, 16);
		gl.bindVertexArray(null);
		this.scene = {
			program: sceneProgram,
			vao: sceneVao,
			vbo: sceneVbo,
			textures: createMaterialArray(gl),
			uWorldProj: uniform(gl, sceneProgram, "uWorldProj"),
			uEntityProj: uniform(gl, sceneProgram, "uEntityProj"),
			uBrightness: uniform(gl, sceneProgram, "uBrightness"),
		};
		gl.useProgram(sceneProgram);
		gl.uniform1i(uniform(gl, sceneProgram, "uTextures"), 0);

		const overlayProgram = link(gl, overlayVert, overlayFrag);
		const overlayVao = must(gl.createVertexArray(), "vao");
		const overlayVbo = must(gl.createBuffer(), "vbo");
		gl.bindVertexArray(overlayVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, overlayVbo);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.bindVertexArray(null);
		this.overlay = {
			program: overlayProgram,
			vao: overlayVao,
			vbo: overlayVbo,
			uRect: uniform(gl, overlayProgram, "uRect"),
			uViewport: uniform(gl, overlayProgram, "uViewport"),
			uColor: uniform(gl, overlayProgram, "uColor"),
		};

		const uiProgram = link(gl, uiVert, uiFrag);
		const uiVao = must(gl.createVertexArray(), "vao");
		const uiVbo = must(gl.createBuffer(), "vbo");
		gl.bindVertexArray(uiVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, uiVbo);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.bindVertexArray(null);
		this.ui = {
			program: uiProgram,
			vao: uiVao,
			vbo: uiVbo,
			texture: createPixelTexture(gl),
			loaded: false,
		};
		gl.useProgram(uiProgram);
		gl.uniform1i(uniform(gl, uiProgram, "uUi"), 0);

		const glyphProgram = link(gl, glyphVert, glyphFrag);
		const glyphVao = must(gl.createVertexArray(), "vao");
		const glyphVbo = must(gl.createBuffer(), "vbo");
		gl.bindVertexArray(glyphVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, glyphVbo);
		gl.bufferData(gl.ARRAY_BUFFER, GLYPH_BUFFER_BYTES, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 8);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 20, 16);
		gl.bindVertexArray(null);
		this.glyph = {
			program: glyphProgram,
			vao: glyphVao,
			vbo: glyphVbo,
			texture: createPixelTexture(gl),
			uViewport: uniform(gl, glyphProgram, "uViewport"),
			scratch: new DataView(new ArrayBuffer(GLYPH_BUFFER_BYTES)),
			atlas: null,
		};
		gl.useProgram(glyphProgram);
		gl.uniform1i(uniform(gl, glyphProgram, "uAtlas"), 0);

		gl.clearColor(CLEAR_COLOR[0], CLEAR_COLOR[1], CLEAR_COLOR[2], CLEAR_COLOR[3]);
		gl.clearDepth(0); // reversed-Z: far = 0
	}

	resize(width: number, height: number): void {
		this.width = width;
		this.height = height;
	}

	setGlyphAtlas(atlas: GlyphAtlas): void {
		const gl = this.gl;
		this.glyph.atlas = atlas;
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.glyph.texture);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA8,
			atlas.size,
			atlas.size,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			atlas.pixels,
		);
	}

	setUiLayer(width: number, height: number, pixels: Uint8Array): void {
		const gl = this.gl;
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.ui.texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
		this.ui.loaded = true;
	}

	render(frame: Frame): void {
		const gl = this.gl;
		gl.viewport(0, 0, this.width, this.height);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		if (frame.camera && frame.vertices && frame.batches.length > 0) {
			gl.useProgram(this.scene.program);
			gl.bindVertexArray(this.scene.vao);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.scene.vbo);
			gl.bufferData(gl.ARRAY_BUFFER, frame.vertices, gl.DYNAMIC_DRAW);
			gl.uniformMatrix4fv(this.scene.uWorldProj, false, frame.camera.worldProj);
			gl.uniformMatrix4fv(this.scene.uEntityProj, false, frame.camera.entityProj);
			gl.uniform1f(this.scene.uBrightness, frame.camera.brightness || 1);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.scene.textures);

			gl.enable(gl.DEPTH_TEST);
			gl.depthFunc(gl.GREATER);
			gl.depthMask(true);
			gl.disable(gl.CULL_FACE);
			gl.disable(gl.BLEND);
			for (const batch of frame.batches) {
				if ((batch.flags & BATCH_TRANSLUCENT) === 0) {
					gl.drawArrays(gl.TRIANGLES, batch.firstVertex, batch.vertexCount);
				}
			}

			// Translucent pass: emitted order is back-to-front (producer sorts);
			// depth-tested against opaque geometry but never writes depth.
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.depthMask(false);
			for (const batch of frame.batches) {
				if ((batch.flags & BATCH_TRANSLUCENT) !== 0) {
					gl.drawArrays(gl.TRIANGLES, batch.firstVertex, batch.vertexCount);
				}
			}
			gl.depthMask(true);
			gl.disable(gl.BLEND);
		}

		gl.disable(gl.DEPTH_TEST);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		if (this.ui.loaded) {
			gl.useProgram(this.ui.program);
			gl.bindVertexArray(this.ui.vao);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, this.ui.texture);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		}

		if (frame.overlays.length > 0) {
			gl.useProgram(this.overlay.program);
			gl.bindVertexArray(this.overlay.vao);
			gl.uniform2f(this.overlay.uViewport, this.width, this.height);
			for (const quad of frame.overlays) {
				gl.uniform4f(this.overlay.uRect, quad.x, quad.y, quad.w, quad.h);
				const [r, g, b, a] = unpackRgba(quad.color);
				gl.uniform4f(this.overlay.uColor, r, g, b, a);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			}
		}

		if (this.glyph.atlas && frame.glyphs.length > 0) {
			const vertexCount = layoutGlyphs(this.glyph.atlas, frame.glyphs, this.glyph.scratch);
			if (vertexCount > 0) {
				gl.useProgram(this.glyph.program);
				gl.bindVertexArray(this.glyph.vao);
				gl.bindBuffer(gl.ARRAY_BUFFER, this.glyph.vbo);
				gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.glyph.scratch, 0, vertexCount * 20);
				gl.uniform2f(this.glyph.uViewport, this.width, this.height);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, this.glyph.texture);
				gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
			}
		}

		gl.disable(gl.BLEND);
		gl.bindVertexArray(null);
	}

	sampleCenter(): Uint8Array | null {
		const gl = this.gl;
		const pixel = new Uint8Array(4);
		gl.readPixels(this.width >> 1, this.height >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
		return pixel;
	}

	dispose(): void {
		const gl = this.gl;
		gl.deleteProgram(this.scene.program);
		gl.deleteProgram(this.overlay.program);
		gl.deleteProgram(this.ui.program);
		gl.deleteProgram(this.glyph.program);
		gl.deleteVertexArray(this.scene.vao);
		gl.deleteVertexArray(this.overlay.vao);
		gl.deleteVertexArray(this.ui.vao);
		gl.deleteVertexArray(this.glyph.vao);
		gl.deleteBuffer(this.scene.vbo);
		gl.deleteBuffer(this.overlay.vbo);
		gl.deleteBuffer(this.ui.vbo);
		gl.deleteBuffer(this.glyph.vbo);
		gl.deleteTexture(this.scene.textures);
		gl.deleteTexture(this.ui.texture);
		gl.deleteTexture(this.glyph.texture);
	}
}

/** The material texture array (procedural layers; see scene/textures.ts). */
function createMaterialArray(gl: WebGL2RenderingContext): WebGLTexture {
	const texture = must(gl.createTexture(), "texture");
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
	gl.texImage3D(
		gl.TEXTURE_2D_ARRAY,
		0,
		gl.RGBA8,
		TEXTURE_SIZE,
		TEXTURE_SIZE,
		MATERIAL_COUNT,
		0,
		gl.RGBA,
		gl.UNSIGNED_BYTE,
		buildTextureLayers(),
	);
	gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
	gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
	return texture;
}

/** A clamped, linearly-filtered RGBA texture for UI/atlas pixels. */
function createPixelTexture(gl: WebGL2RenderingContext): WebGLTexture {
	const texture = must(gl.createTexture(), "texture");
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	return texture;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
	const shader = must(gl.createShader(type), "shader");
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error(`shader compile failed: ${log ?? "unknown"}`);
	}
	return shader;
}

function link(gl: WebGL2RenderingContext, vertexSrc: string, fragmentSrc: string): WebGLProgram {
	const program = must(gl.createProgram(), "program");
	const vs = compile(gl, gl.VERTEX_SHADER, vertexSrc);
	const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSrc);
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const log = gl.getProgramInfoLog(program);
		gl.deleteProgram(program);
		throw new Error(`program link failed: ${log ?? "unknown"}`);
	}
	return program;
}

function uniform(
	gl: WebGL2RenderingContext,
	program: WebGLProgram,
	name: string,
): WebGLUniformLocation {
	const location = gl.getUniformLocation(program, name);
	if (location === null) {
		throw new Error(`missing uniform: ${name}`);
	}
	return location;
}

function must<T>(value: T | null, what: string): T {
	if (value === null) {
		throw new Error(`failed to create ${what}`);
	}
	return value;
}

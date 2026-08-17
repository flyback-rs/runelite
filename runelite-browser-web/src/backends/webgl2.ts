import type { Frame } from "../scene/command-buffer.ts";
import overlayFrag from "../shaders/overlay.frag.glsl";
import overlayVert from "../shaders/overlay.vert.glsl";
import sceneFrag from "../shaders/scene.frag.glsl";
import sceneVert from "../shaders/scene.vert.glsl";
import { type Backend, CLEAR_COLOR, unpackRgba } from "./types.ts";

/** Renders frames with WebGL2 (the broadly-supported fallback backend). */
export class Gl2Backend implements Backend {
	readonly name = "webgl2" as const;

	private readonly gl: WebGL2RenderingContext;
	private readonly scene: {
		program: WebGLProgram;
		vao: WebGLVertexArrayObject;
		vbo: WebGLBuffer;
		uWorldProj: WebGLUniformLocation;
		uEntityProj: WebGLUniformLocation;
		uBrightness: WebGLUniformLocation;
	};
	private readonly overlay: {
		program: WebGLProgram;
		vao: WebGLVertexArrayObject;
		uRect: WebGLUniformLocation;
		uViewport: WebGLUniformLocation;
		uColor: WebGLUniformLocation;
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
		gl.bindVertexArray(null);
		this.scene = {
			program: sceneProgram,
			vao: sceneVao,
			vbo: sceneVbo,
			uWorldProj: uniform(gl, sceneProgram, "uWorldProj"),
			uEntityProj: uniform(gl, sceneProgram, "uEntityProj"),
			uBrightness: uniform(gl, sceneProgram, "uBrightness"),
		};

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
			uRect: uniform(gl, overlayProgram, "uRect"),
			uViewport: uniform(gl, overlayProgram, "uViewport"),
			uColor: uniform(gl, overlayProgram, "uColor"),
		};

		gl.clearColor(CLEAR_COLOR[0], CLEAR_COLOR[1], CLEAR_COLOR[2], CLEAR_COLOR[3]);
		gl.clearDepth(0); // reversed-Z: far = 0
	}

	resize(width: number, height: number): void {
		this.width = width;
		this.height = height;
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

			gl.enable(gl.DEPTH_TEST);
			gl.depthFunc(gl.GREATER);
			gl.depthMask(true);
			gl.disable(gl.CULL_FACE);
			gl.disable(gl.BLEND);
			for (const batch of frame.batches) {
				gl.drawArrays(gl.TRIANGLES, batch.firstVertex, batch.vertexCount);
			}
		}

		if (frame.overlays.length > 0) {
			gl.useProgram(this.overlay.program);
			gl.bindVertexArray(this.overlay.vao);
			gl.disable(gl.DEPTH_TEST);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.uniform2f(this.overlay.uViewport, this.width, this.height);
			for (const quad of frame.overlays) {
				gl.uniform4f(this.overlay.uRect, quad.x, quad.y, quad.w, quad.h);
				const [r, g, b, a] = unpackRgba(quad.color);
				gl.uniform4f(this.overlay.uColor, r, g, b, a);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			}
			gl.disable(gl.BLEND);
		}

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
		gl.deleteVertexArray(this.scene.vao);
		gl.deleteVertexArray(this.overlay.vao);
		gl.deleteBuffer(this.scene.vbo);
	}
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

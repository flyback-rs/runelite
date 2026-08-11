// esbuild loads these as text (see build.mjs `loader`); vitest/tsc treat them as
// string default exports.
declare module "*.glsl" {
	const source: string;
	export default source;
}

declare module "*.wgsl" {
	const source: string;
	export default source;
}

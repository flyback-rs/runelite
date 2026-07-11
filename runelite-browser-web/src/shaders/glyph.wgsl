// Glyph pass (WebGPU): screen-space textured quads from the baked font atlas,
// with a per-vertex tint colour.

struct GlyphUniforms {
	viewport : vec4<f32>, // width, height, unused, unused
};

@group(0) @binding(0) var<uniform> uni : GlyphUniforms;
@group(0) @binding(1) var atlasSampler : sampler;
@group(0) @binding(2) var atlas : texture_2d<f32>;

struct VsOut {
	@builtin(position) position : vec4<f32>,
	@location(0) uv : vec2<f32>,
	@location(1) color : vec4<f32>,
};

@vertex
fn vs_main(
	@location(0) aPos : vec2<f32>,
	@location(1) aUv : vec2<f32>,
	@location(2) aColor : vec4<f32>,
) -> VsOut {
	var out : VsOut;
	let ndc = vec2<f32>(aPos.x / uni.viewport.x * 2.0 - 1.0, 1.0 - aPos.y / uni.viewport.y * 2.0);
	out.position = vec4<f32>(ndc, 0.0, 1.0);
	out.uv = aUv;
	out.color = aColor;
	return out;
}

@fragment
fn fs_main(data : VsOut) -> @location(0) vec4<f32> {
	let coverage = textureSample(atlas, atlasSampler, data.uv).a;
	return vec4<f32>(data.color.rgb, data.color.a * coverage);
}

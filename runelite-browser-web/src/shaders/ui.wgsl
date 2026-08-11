// UI composite (WebGPU): stretches the client's pixel layer over the whole
// canvas as a blended fullscreen quad (triangle strip).

@group(0) @binding(0) var uiSampler : sampler;
@group(0) @binding(1) var uiTexture : texture_2d<f32>;

struct VsOut {
	@builtin(position) position : vec4<f32>,
	@location(0) uv : vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vid : u32) -> VsOut {
	var corners = array<vec2<f32>, 4>(
		vec2<f32>(0.0, 0.0),
		vec2<f32>(1.0, 0.0),
		vec2<f32>(0.0, 1.0),
		vec2<f32>(1.0, 1.0));
	let corner = corners[vid];
	var out : VsOut;
	out.position = vec4<f32>(corner.x * 2.0 - 1.0, 1.0 - corner.y * 2.0, 0.0, 1.0);
	out.uv = corner;
	return out;
}

@fragment
fn fs_main(data : VsOut) -> @location(0) vec4<f32> {
	return textureSample(uiTexture, uiSampler, data.uv);
}

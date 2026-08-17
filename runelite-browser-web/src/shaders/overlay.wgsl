// 2D HUD overlay (WebGPU): a unit quad (triangle-strip) expanded to a pixel-space
// rectangle, drawn with a solid colour.

struct Overlay {
	rect : vec4<f32>,     // x, y, w, h in pixels
	viewport : vec4<f32>, // width, height, unused, unused
	color : vec4<f32>,
};

@group(0) @binding(0) var<uniform> ov : Overlay;

@vertex
fn vs_main(@builtin(vertex_index) vid : u32) -> @builtin(position) vec4<f32> {
	var corners = array<vec2<f32>, 4>(
		vec2<f32>(0.0, 0.0),
		vec2<f32>(1.0, 0.0),
		vec2<f32>(0.0, 1.0),
		vec2<f32>(1.0, 1.0));
	let corner = corners[vid];
	let px = ov.rect.xy + corner * ov.rect.zw;
	let ndc = vec2<f32>(px.x / ov.viewport.x * 2.0 - 1.0, 1.0 - px.y / ov.viewport.y * 2.0);
	return vec4<f32>(ndc, 0.0, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
	return ov.color;
}

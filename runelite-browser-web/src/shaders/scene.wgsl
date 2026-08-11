// Scene shader (WebGPU). Mirror of scene.vert.glsl / scene.frag.glsl: unpack the
// packed abhsl colour, OSRS HSL -> RGB, reversed-Z world/entity projection, and
// texture-array sampling by the per-vertex material id.

struct Camera {
	worldProj : mat4x4<f32>,
	entityProj : mat4x4<f32>,
	brightness : f32,
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(0) @binding(1) var texSampler : sampler;
@group(0) @binding(2) var textures : texture_2d_array<f32>;

struct VsOut {
	@builtin(position) position : vec4<f32>,
	@location(0) color : vec4<f32>,
	@location(1) uv : vec2<f32>,
	@location(2) @interpolate(flat) material : i32,
};

fn channel(low : f32, high : f32, h : f32) -> f32 {
	if (6.0 * h < 1.0) { return low + (high - low) * 6.0 * h; }
	if (2.0 * h < 1.0) { return high; }
	if (3.0 * h < 2.0) { return low + (high - low) * (0.66666667 - h) * 6.0; }
	return low;
}

fn hslToRgb(hsl : vec3<f32>, brightness : f32) -> vec3<f32> {
	let hue = hsl.x / 64.0 + 0.0078125;
	let sat = hsl.y / 8.0 + 0.0625;
	let base = hsl.z / 128.0;
	var high : f32;
	if (base < 0.5) { high = base * (1.0 + sat); } else { high = base + sat - base * sat; }
	let low = 2.0 * base - high;
	var hr = hue + 0.33333334;
	if (hr > 1.0) { hr = hr - 1.0; }
	var hb = hue - 0.33333334;
	if (hb < 0.0) { hb = hb + 1.0; }
	return vec3<f32>(
		pow(channel(low, high, hr), brightness),
		pow(channel(low, high, hue), brightness),
		pow(channel(low, high, hb), brightness));
}

@vertex
fn vs_main(
	@location(0) aPos : vec3<f32>,
	@location(1) aAbhsl : u32,
	@location(2) aTex : vec4<i32>,
) -> VsOut {
	let a = f32((aAbhsl >> 24u) & 0xffu) / 255.0;
	let hsl = vec3<f32>(f32((aAbhsl >> 10u) & 63u), f32((aAbhsl >> 7u) & 7u), f32(aAbhsl & 127u));
	let rgb = hslToRgb(hsl, camera.brightness);
	let world = camera.entityProj * vec4<f32>(aPos, 1.0);
	var out : VsOut;
	out.position = camera.worldProj * world;
	out.color = vec4<f32>(rgb, 1.0 - a);
	out.uv = vec2<f32>(f32(aTex.y), f32(aTex.z)) / 4096.0;
	out.material = aTex.x;
	return out;
}

@fragment
fn fs_main(data : VsOut) -> @location(0) vec4<f32> {
	var color = data.color;
	if (data.material > 0) {
		// Layer materialId - 1, modulated by the vertex colour. Sampled at level
		// 0 explicitly so the non-uniform branch is valid WGSL.
		let tex = textureSampleLevel(textures, texSampler, data.uv, data.material - 1, 0.0);
		color = vec4<f32>(tex.rgb * data.color.rgb, data.color.a);
	}
	return color;
}

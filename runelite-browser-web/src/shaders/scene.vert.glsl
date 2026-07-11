#version 300 es
// Scene vertex shader (WebGL2), a subset of the RuneLite GPU plugin's vert.glsl:
// unpack the packed abhsl colour, convert OSRS HSL -> RGB, apply the
// column-major reversed-Z world/entity projection, and pass the material id and
// Q12 UVs through for texture-array sampling.
precision highp float;
precision highp int;

layout(location = 0) in vec3 aPos;
layout(location = 1) in uint aAbhsl;
layout(location = 2) in ivec4 aTex; // materialId (0 = untextured), uQ12, vQ12, 0

uniform mat4 uWorldProj;
uniform mat4 uEntityProj;
uniform float uBrightness;

out vec4 vColor;
out vec2 vUv;
flat out int vMaterial;

float channel(float low, float high, float h)
{
	if (6.0 * h < 1.0)
	{
		return low + (high - low) * 6.0 * h;
	}
	if (2.0 * h < 1.0)
	{
		return high;
	}
	if (3.0 * h < 2.0)
	{
		return low + (high - low) * (0.6666666666666666 - h) * 6.0;
	}
	return low;
}

vec3 hslToRgb(vec3 hsl, float brightness)
{
	float hue = hsl.x / 64.0 + 0.0078125;
	float sat = hsl.y / 8.0 + 0.0625;
	float base = hsl.z / 128.0;
	float high;
	if (base < 0.5)
	{
		high = base * (1.0 + sat);
	}
	else
	{
		high = base + sat - base * sat;
	}
	float low = 2.0 * base - high;
	float hr = hue + 0.3333333333333333;
	if (hr > 1.0)
	{
		hr -= 1.0;
	}
	float hb = hue - 0.3333333333333333;
	if (hb < 0.0)
	{
		hb += 1.0;
	}
	return vec3(
		pow(channel(low, high, hr), brightness),
		pow(channel(low, high, hue), brightness),
		pow(channel(low, high, hb), brightness));
}

void main()
{
	float a = float((aAbhsl >> 24u) & 0xffu) / 255.0;
	vec3 hsl = vec3(float((aAbhsl >> 10u) & 63u), float((aAbhsl >> 7u) & 7u), float(aAbhsl & 127u));
	vec3 rgb = hslToRgb(hsl, uBrightness);
	vec4 world = uEntityProj * vec4(aPos, 1.0);
	gl_Position = uWorldProj * world;
	vColor = vec4(rgb, 1.0 - a);
	vUv = vec2(aTex.yz) / 4096.0;
	vMaterial = aTex.x;
}

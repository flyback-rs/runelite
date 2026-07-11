#version 300 es
// Glyph pass: screen-space textured quads from the baked font atlas, with a
// per-vertex tint colour.
precision highp float;

layout(location = 0) in vec2 aPos; // pixels, top-left origin
layout(location = 1) in vec2 aUv;
layout(location = 2) in vec4 aColor; // normalized u8 rgba

uniform vec2 uViewport;

out vec2 vUv;
out vec4 vColor;

void main()
{
	vec2 ndc = vec2(aPos.x / uViewport.x * 2.0 - 1.0, 1.0 - aPos.y / uViewport.y * 2.0);
	gl_Position = vec4(ndc, 0.0, 1.0);
	vUv = aUv;
	vColor = aColor;
}

#version 300 es
// 2D HUD overlay: expands a unit quad to a pixel-space rectangle in NDC.
precision highp float;

layout(location = 0) in vec2 aCorner;

uniform vec4 uRect; // x, y, w, h in pixels (top-left origin)
uniform vec2 uViewport; // width, height in pixels

void main()
{
	vec2 px = uRect.xy + aCorner * uRect.zw;
	vec2 ndc = vec2(px.x / uViewport.x * 2.0 - 1.0, 1.0 - px.y / uViewport.y * 2.0);
	gl_Position = vec4(ndc, 0.0, 1.0);
}

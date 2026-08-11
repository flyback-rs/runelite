#version 300 es
// UI composite: stretches the client's pixel layer over the whole canvas.
precision highp float;

layout(location = 0) in vec2 aCorner; // unit quad

out vec2 vUv;

void main()
{
	vUv = aCorner;
	gl_Position = vec4(aCorner.x * 2.0 - 1.0, 1.0 - aCorner.y * 2.0, 0.0, 1.0);
}

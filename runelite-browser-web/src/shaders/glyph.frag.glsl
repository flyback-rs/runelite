#version 300 es
precision highp float;

in vec2 vUv;
in vec4 vColor;

uniform sampler2D uAtlas;

out vec4 FragColor;

void main()
{
	// The atlas stores white glyph coverage; tint by the run colour.
	float coverage = texture(uAtlas, vUv).a;
	FragColor = vec4(vColor.rgb, vColor.a * coverage);
}

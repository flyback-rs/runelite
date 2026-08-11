#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uUi;

out vec4 FragColor;

void main()
{
	FragColor = texture(uUi, vUv);
}

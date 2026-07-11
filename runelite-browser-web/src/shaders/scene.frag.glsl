#version 300 es
precision highp float;
precision highp int;

in vec4 vColor;
in vec2 vUv;
flat in int vMaterial;

uniform mediump sampler2DArray uTextures;

out vec4 FragColor;

void main()
{
	vec4 color = vColor;
	if (vMaterial > 0)
	{
		// Layer materialId - 1; the texture is modulated by the vertex colour
		// (textured faces carry a near-white HSL so detail survives).
		vec3 tex = texture(uTextures, vec3(vUv, float(vMaterial - 1))).rgb;
		color = vec4(tex * vColor.rgb, vColor.a);
	}
	FragColor = color;
}

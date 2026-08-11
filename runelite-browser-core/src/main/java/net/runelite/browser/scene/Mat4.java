/*
 * Copyright (c) 2026, RuneLite Browser Port
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
package net.runelite.browser.scene;

/**
 * Minimal column-major 4x4 float matrix math (index = {@code column * 4 + row}),
 * matching the OpenGL/WGSL memory layout the renderer consumes. The projection is
 * the reversed-Z infinite-far perspective used by the GPU plugin's
 * {@code Mat4.projection} (near maps to 1, infinity to 0), paired with a
 * {@code GREATER} depth test and a clear depth of 0.
 */
public final class Mat4
{
	private Mat4()
	{
	}

	public static float[] identity()
	{
		float[] m = new float[16];
		m[0] = 1f;
		m[5] = 1f;
		m[10] = 1f;
		m[15] = 1f;
		return m;
	}

	public static float[] multiply(float[] a, float[] b)
	{
		float[] out = new float[16];
		for (int col = 0; col < 4; col++)
		{
			for (int row = 0; row < 4; row++)
			{
				float sum = 0f;
				for (int k = 0; k < 4; k++)
				{
					sum += a[k * 4 + row] * b[col * 4 + k];
				}
				out[col * 4 + row] = sum;
			}
		}
		return out;
	}

	public static float[] translation(float x, float y, float z)
	{
		float[] m = identity();
		m[12] = x;
		m[13] = y;
		m[14] = z;
		return m;
	}

	public static float[] rotationX(float radians)
	{
		float c = (float) Math.cos(radians);
		float s = (float) Math.sin(radians);
		float[] m = identity();
		m[5] = c;
		m[6] = s;
		m[9] = -s;
		m[10] = c;
		return m;
	}

	public static float[] rotationY(float radians)
	{
		float c = (float) Math.cos(radians);
		float s = (float) Math.sin(radians);
		float[] m = identity();
		m[0] = c;
		m[2] = -s;
		m[8] = s;
		m[10] = c;
		return m;
	}

	/**
	 * A right-handed reversed-Z infinite-far perspective projection with clip
	 * depth in {@code [0, 1]}.
	 *
	 * @param fovyRadians vertical field of view in radians
	 * @param aspect viewport width / height
	 * @param near near plane distance (maps to clip depth 1)
	 * @return the projection matrix
	 */
	public static float[] perspectiveReversedZ(float fovyRadians, float aspect, float near)
	{
		float f = (float) (1.0 / Math.tan(fovyRadians / 2.0));
		float[] m = new float[16];
		m[0] = f / aspect;
		m[5] = f;
		m[11] = -1f;
		m[14] = near;
		return m;
	}
}

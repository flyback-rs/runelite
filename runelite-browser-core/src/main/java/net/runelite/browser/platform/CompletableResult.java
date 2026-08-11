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
package net.runelite.browser.platform;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * A settable {@link AsyncResult}. Platform implementations create one, hand the
 * {@code AsyncResult} view to the caller, and later call {@link #complete} or
 * {@link #fail}. It is not thread safe; the browser platform is single threaded
 * per worker and desktop callers complete it synchronously.
 *
 * @param <T> the result value type
 */
public final class CompletableResult<T> implements AsyncResult<T>
{
	private boolean done;
	private boolean failed;
	private T value;
	private Throwable error;
	private final List<Consumer<? super T>> successCallbacks = new ArrayList<>();
	private final List<Consumer<Throwable>> failureCallbacks = new ArrayList<>();

	/**
	 * @param value the value
	 * @param <T> the value type
	 * @return a result already completed with {@code value}
	 */
	public static <T> CompletableResult<T> completed(T value)
	{
		CompletableResult<T> result = new CompletableResult<>();
		result.complete(value);
		return result;
	}

	/**
	 * @param error the failure cause
	 * @param <T> the value type
	 * @return a result already failed with {@code error}
	 */
	public static <T> CompletableResult<T> failed(Throwable error)
	{
		CompletableResult<T> result = new CompletableResult<>();
		result.fail(error);
		return result;
	}

	/**
	 * Completes the result. Subsequent completion or failure calls are ignored.
	 *
	 * @param result the value
	 */
	public void complete(T result)
	{
		if (done)
		{
			return;
		}
		done = true;
		value = result;
		for (Consumer<? super T> callback : successCallbacks)
		{
			callback.accept(result);
		}
		successCallbacks.clear();
		failureCallbacks.clear();
	}

	/**
	 * Fails the result. Subsequent completion or failure calls are ignored.
	 *
	 * @param cause the failure cause
	 */
	public void fail(Throwable cause)
	{
		if (done)
		{
			return;
		}
		done = true;
		failed = true;
		error = cause;
		for (Consumer<Throwable> callback : failureCallbacks)
		{
			callback.accept(cause);
		}
		successCallbacks.clear();
		failureCallbacks.clear();
	}

	@Override
	public AsyncResult<T> onSuccess(Consumer<? super T> callback)
	{
		if (done)
		{
			if (!failed)
			{
				callback.accept(value);
			}
		}
		else
		{
			successCallbacks.add(callback);
		}
		return this;
	}

	@Override
	public AsyncResult<T> onFailure(Consumer<Throwable> callback)
	{
		if (done)
		{
			if (failed)
			{
				callback.accept(error);
			}
		}
		else
		{
			failureCallbacks.add(callback);
		}
		return this;
	}

	/**
	 * @return whether the result has settled (completed or failed)
	 */
	public boolean isDone()
	{
		return done;
	}

	/**
	 * @return whether the result settled as a failure
	 */
	public boolean isFailed()
	{
		return failed;
	}
}

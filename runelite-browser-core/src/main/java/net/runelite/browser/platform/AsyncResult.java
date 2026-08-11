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

import java.util.function.Consumer;

/**
 * A minimal asynchronous result / promise abstraction.
 *
 * <p>The browser platform is fundamentally asynchronous (storage, networking and
 * rendering are all non-blocking), but {@link java.util.concurrent.CompletableFuture}
 * is not part of TeaVM's WasmGC class library, so the platform seam uses this
 * lightweight type instead. Callbacks are invoked at most once; if the result has
 * already settled when a callback is attached, it is invoked immediately.</p>
 *
 * @param <T> the result value type
 */
public interface AsyncResult<T>
{
	/**
	 * Registers a callback invoked with the value when the result completes
	 * successfully.
	 *
	 * @param callback the success callback
	 * @return this, for chaining
	 */
	AsyncResult<T> onSuccess(Consumer<? super T> callback);

	/**
	 * Registers a callback invoked with the cause when the result fails.
	 *
	 * @param callback the failure callback
	 * @return this, for chaining
	 */
	AsyncResult<T> onFailure(Consumer<Throwable> callback);
}

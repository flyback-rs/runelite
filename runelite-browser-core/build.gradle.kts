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

plugins {
    java
    `java-library`
    `maven-publish`
    id("org.teavm") version "0.11.0"
}

val teavmVersion = "0.11.0"

java {
    withSourcesJar()
}

dependencies {
    // The platform seam (interfaces + value types) is pure Java and needs no
    // dependencies. The browser implementations under
    // net.runelite.browser.platform.browser use TeaVM's JS interop; teavm-jso is
    // declared as `implementation` (not `api`) so it stays off the compile
    // classpath of desktop consumers such as runelite-client, while remaining on
    // the runtime classpath that the TeaVM WasmGC compiler analyses.
    implementation("org.teavm:teavm-jso:$teavmVersion")
    implementation("org.teavm:teavm-jso-apis:$teavmVersion")

    testImplementation(libs.junit)
    testRuntimeOnly(libs.slf4j.simple)
}

// WasmGC target: compiles net.runelite.browser.BrowserBootstrap (and everything
// it reaches) to a WebAssembly GC module plus a JS runtime loader under
// build/teavm. See src/main/webapp/index.html for how it is loaded in a browser.
teavm {
    wasmGC {
        mainClass.set("net.runelite.browser.BrowserBootstrap")
        targetFileName.set("runelite-browser.wasm")
        obfuscated.set(false)
        sourceMap.set(true)
        outputDir.set(layout.buildDirectory.dir("teavm"))
    }
}

publishing {
    publications {
        create<MavenPublication>("browserCore") {
            from(components["java"])
        }
    }
}

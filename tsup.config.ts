import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    platform: "browser",
    target: "es2020",
    sourcemap: true,
    // 👇 this bundles ALL deps, including @magicfeedback/native
    noExternal: [/@magicfeedback\/native/],
    esbuildOptions(options) {
        // 👇 Shim Node built-ins so the browser doesn’t crash
        options.alias = {
            stream: "stream-browserify",
            events: "events",
            util: "util",
            path: "path-browserify",
            buffer: "buffer",
        };
        options.define = {
            global: "window",
        };
    },
});
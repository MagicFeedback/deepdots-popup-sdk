import { defineConfig } from "tsup";
import { sdkVersionDefine } from "./scripts/sdk-version-define.mjs";

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
    loader: { '.css': 'text' }, // permite importar CSS como string
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
            ...sdkVersionDefine("web"),
        };
    },
});
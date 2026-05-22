import solidPlugin from "@opentui/solid/bun-plugin";

console.log("Starting build...");

const build1 = await Bun.build({
    entrypoints: ["./src/index.ts"],
    outdir: "./dist",
    target: "node",
    format: "esm",
    plugins: [solidPlugin],
    minify: false,
    external: [
        "@opencode-ai/plugin",
        "@opencode-ai/sdk",
        "@opentui/core",
        "@opentui/solid",
        "solid-js",
    ],
});
console.log("Build 1 (index) success:", build1.success);
if (!build1.success) {
    console.error(build1.logs);
}

const build2 = await Bun.build({
    entrypoints: ["./src/server.ts"],
    outdir: "./dist",
    target: "node",
    format: "esm",
    minify: false,
    external: ["@opencode-ai/plugin", "@opencode-ai/sdk"],
});
console.log("Build 2 (server) success:", build2.success);
if (!build2.success) {
    console.error(build2.logs);
}

const build3 = await Bun.build({
    entrypoints: ["./src/tui.tsx"],
    outdir: "./dist",
    target: "node",
    format: "esm",
    plugins: [solidPlugin],
    minify: false,
    external: [
        "@opencode-ai/plugin",
        "@opencode-ai/sdk",
        "@opentui/core",
        "@opentui/solid",
        "solid-js",
    ],
});
console.log("Build 3 (tui) success:", build3.success);
if (!build3.success) {
    console.error(build3.logs);
}

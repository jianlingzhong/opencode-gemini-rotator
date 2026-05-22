// Stryker mutation testing configuration.
// See https://stryker-mutator.io/docs/stryker-js/config-file/
export default {
    packageManager: "npm",
    reporters: ["progress", "clear-text", "html"],
    testRunner: "vitest",
    coverageAnalysis: "perTest",
    mutate: ["src/server.ts"],
    thresholds: {
        // Current baseline: ~46%. Aim is 60%+. Set break to a value below
        // the current score so we have headroom to improve without
        // immediately failing CI.
        high: 80,
        low: 50,
        break: 40,
    },
};

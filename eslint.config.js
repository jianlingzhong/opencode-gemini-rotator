// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";
import promise from "eslint-plugin-promise";
import n from "eslint-plugin-n";

export default tseslint.config(
    {
        ignores: ["dist/", "coverage/", "node_modules/", "*.log", ".opencode/"],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    security.configs.recommended,
    promise.configs["flat/recommended"],
    {
        files: ["**/*.{ts,tsx}"],
        languageOptions: {
            parserOptions: {
                project: "./tsconfig.lint.json",
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: { n },
        rules: {
            // We use console.warn intentionally for the zod validation
            // fallback path; everything else routes through the optional
            // fileLog. Keep warn/error allowed; ban console.log.
            "no-console": ["error", { allow: ["warn", "error"] }],
            "no-debugger": "error",
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-non-null-assertion": "off", // sort() narrowing
            // Security plugin tweaks: we know we're touching fs/network on purpose.
            "security/detect-non-literal-fs-filename": "off",
            "security/detect-object-injection": "off",
            "promise/always-return": "off",
            "n/no-process-env": "off",
        },
    },
    {
        files: ["**/*.test.ts", "src/verify.test.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "no-empty": "off",
        },
    },
    {
        files: ["build.ts", "*.config.{js,ts}", "scripts/**/*.{js,mjs,ts}"],
        languageOptions: {
            globals: {
                console: "readonly",
                process: "readonly",
                Bun: "readonly",
            },
        },
        rules: {
            "no-console": "off",
            "security/detect-non-literal-fs-filename": "off",
        },
    },
);

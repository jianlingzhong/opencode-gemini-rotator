import { type TuiPlugin, type TuiPluginApi } from "@opencode-ai/plugin/tui";
import { createSignal, onMount, onCleanup, Show } from "solid-js";
import fs from "fs";
import path from "path";
import os from "os";

import { type KeyInfo, initialKeyInfo } from "./shared.js";

const statusFile = path.join(os.tmpdir(), "gemini-rotator-status.json");
const DEBUG = process.env.OPENCODE_GEMINI_DEBUG === "1";
const debugLogFile = path.join(os.tmpdir(), "gemini-rotator-tui.log");

function debugLog(msg: string) {
    if (!DEBUG) return;
    try {
        fs.appendFileSync(debugLogFile, `[${new Date().toISOString()}] ${msg}\n`);
    } catch {
        // ignore
    }
}

function SidebarView(props: { api: TuiPluginApi }) {
    const [info, setInfo] = createSignal<KeyInfo>(initialKeyInfo);
    const theme = () => props.api.theme.current;

    onMount(() => {
        debugLog(`config keys: ${Object.keys(props.api.state.config).join(", ")}`);

        const interval = setInterval(() => {
            try {
                if (fs.existsSync(statusFile)) {
                    const content = fs.readFileSync(statusFile, "utf-8");
                    const data = JSON.parse(content) as KeyInfo;
                    setInfo(data);
                }
            } catch (e) {
                debugLog(`error reading status: ${e}`);
            }
        }, 1000);
        onCleanup(() => clearInterval(interval));
    });

    const isGeminiActive = () => info().total > 0;

    return (
        <box>
            <Show when={isGeminiActive()}>
                <box paddingX={1} marginBottom={1}>
                    <box flexDirection="row" gap={1}>
                        <text fg={theme().primary}>
                            <b>GEMINI ROTATOR</b>
                        </text>
                    </box>
                    <Show
                        when={info().maskedKey !== "None"}
                        fallback={<text fg={theme().textMuted}>Waiting for request...</text>}
                    >
                        <box flexDirection="row" gap={1}>
                            <text fg={theme().text}>Active Key:</text>
                            <text fg={theme().success}>#{info().index}</text>
                            <text fg={theme().textMuted}>({info().maskedKey})</text>
                        </box>
                        <text fg={theme().textMuted}>Pool size: {info().total}</text>
                    </Show>
                </box>
            </Show>
        </box>
    );
}

export const tui: TuiPlugin = async api => {
    try {
        api.slots.register({
            order: 100,
            slots: {
                home_prompt_right() {
                    return <SidebarView api={api} />;
                },
                sidebar_content() {
                    return <SidebarView api={api} />;
                },
            },
        });
    } catch (e) {
        debugLog(`failed to register slots: ${e}`);
    }
};

export const id = "gemini-rotator-tui";
export default { id, tui };

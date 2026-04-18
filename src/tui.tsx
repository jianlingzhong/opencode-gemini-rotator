import { type TuiPlugin, type TuiPluginApi } from "@opencode-ai/plugin/tui";
import { createSignal, onMount, onCleanup, Show } from "solid-js";
import fs from 'fs';
import path from 'path';
import os from 'os';

import { type KeyInfo, initialKeyInfo } from "./shared.js";

const statusFile = path.join(os.tmpdir(), 'gemini-rotator-status.json');

function SidebarView(props: { api: TuiPluginApi, session_id?: string }) {
    const [info, setInfo] = createSignal<KeyInfo>(initialKeyInfo);
    const [sessionModel, setSessionModel] = createSignal<string>('');
    const theme = () => props.api.theme.current;

    onMount(() => {
        try {
            fs.appendFileSync('/tmp/gemini-rotator-config.log', `[${new Date().toISOString()}] config keys: ${Object.keys(props.api.state.config).join(', ')}\n`);
            fs.appendFileSync('/tmp/gemini-rotator-config.log', `[${new Date().toISOString()}] full config: ${JSON.stringify(props.api.state.config)}\n`);
        } catch (e) {}
        
        if (props.session_id) {
            props.api.client.session.get({ sessionID: props.session_id })
                .then((res: any) => {
                    const model = res?.data?.extra?.model || res?.data?.model || '';
                    if (model) setSessionModel(model);
                    try {
                        fs.appendFileSync('/tmp/gemini-rotator-tui.log', `[${new Date().toISOString()}] Session GET: keys=${Object.keys(res?.data || {})}, model=${model}, extra=${JSON.stringify(res?.data?.extra)}\n`);
                    } catch (e) {}
                })
                .catch(() => {});
        }

        const interval = setInterval(() => {
            try {
                fs.appendFileSync('/tmp/gemini-rotator-tui.log', `[${new Date().toISOString()}] checking statusFile=${statusFile}, exists=${fs.existsSync(statusFile)}\n`);
                if (fs.existsSync(statusFile)) {
                    const content = fs.readFileSync(statusFile, 'utf-8');
                    fs.appendFileSync('/tmp/gemini-rotator-tui.log', `[${new Date().toISOString()}] statusFile content=${content}\n`);
                    const data = JSON.parse(content);
                    setInfo(data);
                }
            } catch (e) {
                fs.appendFileSync('/tmp/gemini-rotator-tui.log', `[${new Date().toISOString()}] error in interval=${e}\n`);
            }
        }, 1000);
        onCleanup(() => clearInterval(interval));
    });

    const isGeminiActive = () => {
        return info().total > 0;
    };

    return (
        <box>
            <Show when={isGeminiActive()}>
                <box paddingX={1} marginBottom={1}>
                    <box flexDirection="row" gap={1}>
                        <text fg={theme().primary}><b>GEMINI ROTATOR</b></text>
                    </box>
                    <Show when={info().maskedKey !== 'None'} fallback={<text fg={theme().textMuted}>Waiting for request...</text>}>
                        <box flexDirection="row" gap={1}>
                            <text fg={theme().text}>Active Key:</text>
                            <text fg={theme().success}>#{info().index}</text>
                            <text fg={theme().textMuted}>({info().maskedKey})</text>
                        </box>
                        <text fg={theme().textMuted}>
                            Pool size: {info().total}
                        </text>
                    </Show>
                </box>
            </Show>
        </box>
    );
}

export const tui: TuiPlugin = async (api) => {
    try {
        api.slots.register({
            order: 100,
            slots: {
                home_prompt_right() {
                    return <SidebarView api={api} />;
                },
                sidebar_content(props) {
                    return <SidebarView api={api} session_id={(props as any).session_id} />;
                }
            }
        });
    } catch (e) {}
};

export const id = "gemini-rotator-tui";
export default { id, tui };
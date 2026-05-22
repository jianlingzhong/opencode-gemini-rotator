export interface KeyInfo {
    index: number;
    maskedKey: string;
    total: number;
}

export const initialKeyInfo: KeyInfo = { index: 0, maskedKey: "None", total: 0 };

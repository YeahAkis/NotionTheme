import { inflate, gzip } from 'pako';

export interface NbtNamedTag {
    name: string;
    value: NbtCompound;
}

export type NbtCompound = Record<string, NbtTagValue>;

export interface NbtTagValue {
    type: string;
    value: any;
}

function getNbt() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('nbt') as {
        parseUncompressed: (data: ArrayBuffer) => NbtNamedTag;
        writeUncompressed: (value: NbtNamedTag) => ArrayBuffer;
        tagTypes: Record<string, number>;
        tagTypeNames: Record<number, string>;
    };
}

/**
 * The nbt library returns TAG_Long as [high32, low32] (two signed 32-bit ints).
 * Reconstruct the full 64-bit value as a BigInt string so precision is preserved.
 */
export function longToString(pair: [number, number] | number): string {
    if (!Array.isArray(pair)) return String(pair);
    const [high, low] = pair;
    // Use BigInt() as a function call (not literals) — works on ES2019 targets
    // since it's a runtime value, not syntax. The n suffix is what's banned.
    const hi = (BigInt as any)(high >>> 0);
    const lo = (BigInt as any)(low >>> 0);
    const full = (hi * (BigInt as any)(0x100000000)) + lo;
    const limit = (BigInt as any)('9223372036854775808'); // 2^63
    const max =   (BigInt as any)('18446744073709551616'); // 2^64
    const signed = full >= limit ? full - max : full;
    return signed.toString();
}

/**
 * Walk an NBT compound and fix all TAG_Long values in-place so downstream
 * code always sees a plain string instead of [high, low].
 */
export function fixLongs(compound: NbtCompound): NbtCompound {
    const out: NbtCompound = {};
    for (const [k, v] of Object.entries(compound)) {
        if (v.type === 'long') {
            out[k] = { type: 'long', value: longToString(v.value) };
        } else if (v.type === 'compound') {
            out[k] = { type: 'compound', value: fixLongs(v.value) };
        } else if (v.type === 'list') {
            const listVal = v.value as { type: string; value: any[] };
            const fixedItems =
                listVal.type === 'long'
                    ? listVal.value.map((item: any) => longToString(item))
                    : listVal.type === 'compound'
                    ? listVal.value.map((item: any) => fixLongs(item))
                    : listVal.value;
            out[k] = { type: 'list', value: { type: listVal.type, value: fixedItems } };
        } else {
            out[k] = v;
        }
    }
    return out;
}

export async function parseNbtFile(arrayBuffer: ArrayBuffer): Promise<NbtNamedTag> {
    const inflated = inflate(new Uint8Array(arrayBuffer));
    const plain = inflated.buffer.slice(
        inflated.byteOffset,
        inflated.byteOffset + inflated.byteLength,
    ) as ArrayBuffer;
    const parsed = getNbt().parseUncompressed(plain);
    // Fix all longs globally so callers never see [high, low]
    return { name: parsed.name, value: fixLongs(parsed.value) };
}

export function writeNbtFile(tag: NbtNamedTag): Uint8Array {
    const uncompressed = getNbt().writeUncompressed(tag);
    return gzip(new Uint8Array(uncompressed));
}

export function compoundToPlainJson(compound: NbtCompound): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(compound)) {
        if (v.type === 'compound') {
            out[k] = compoundToPlainJson(v.value);
        } else if (v.type === 'list') {
            const listVal = v.value as { type: string; value: any[] };
            out[k] = (listVal.value ?? []).map((item: any) =>
                listVal.type === 'compound' ? compoundToPlainJson(item) : item,
            );
        } else {
            out[k] = v.value;
        }
    }
    return out;
}

export function mergeEdits(original: NbtCompound, json: Record<string, any>): NbtCompound {
    const result: NbtCompound = {};
    for (const key of Object.keys(original)) {
        const orig = original[key];
        const edited = json[key];
        if (edited === undefined) {
            result[key] = orig;
        } else if (orig.type === 'compound' && typeof edited === 'object' && !Array.isArray(edited)) {
            result[key] = { type: 'compound', value: mergeEdits(orig.value, edited) };
        } else if (orig.type === 'list') {
            const origList = orig.value as { type: string; value: any[] };
            const editedItems = Array.isArray(edited) ? edited : origList.value;
            let mergedItems: any[];
            if (origList.type === 'compound') {
                mergedItems = editedItems.map((editedItem: any, i: number) => {
                    const origItem = origList.value[i] ?? origList.value[0];
                    if (origItem && typeof origItem === 'object' && !Array.isArray(origItem)) {
                        return mergeEdits(origItem as NbtCompound, editedItem);
                    }
                    return editedItem;
                });
            } else {
                mergedItems = editedItems;
            }
            result[key] = { type: 'list', value: { type: origList.type, value: mergedItems } };
        } else {
            result[key] = { type: orig.type, value: edited };
        }
    }
    return result;
}

export async function fetchAndParseNbt(url: string): Promise<NbtNamedTag> {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    return parseNbtFile(buf);
}

// Aliases for backwards compatibility with existing imports
export const nbtLongToString = longToString;

export function nbtGet(node: any, ...keys: string[]): any {
    let cur = node?.value ?? node;
    for (const k of keys) {
        if (cur === undefined || cur === null) return undefined;
        cur = cur[k]?.value ?? cur[k];
    }
    return cur;
}
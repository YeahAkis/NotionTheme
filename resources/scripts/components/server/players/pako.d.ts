declare module 'pako' {
    export function inflate(data: Uint8Array | ArrayBuffer, options?: object): Uint8Array;
    export function deflate(data: Uint8Array | ArrayBuffer, options?: object): Uint8Array;
    export function gzip(data: Uint8Array | ArrayBuffer, options?: object): Uint8Array;
    export function ungzip(data: Uint8Array | ArrayBuffer, options?: object): Uint8Array;
    export function inflateRaw(data: Uint8Array | ArrayBuffer, options?: object): Uint8Array;
    export function deflateRaw(data: Uint8Array | ArrayBuffer, options?: object): Uint8Array;
}
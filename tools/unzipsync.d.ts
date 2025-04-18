export interface Unzipped {
    [path: string]: Uint8Array;
}
export declare function unzipSync(data: Uint8Array): Unzipped;
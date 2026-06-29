// heic-convert ships no TypeScript types. Convert HEIC/HEIF buffers to JPEG/PNG.
declare module 'heic-convert' {
  interface HeicConvertOptions {
    buffer: Buffer | Uint8Array;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }
  function convert(options: HeicConvertOptions): Promise<ArrayBuffer>;
  export default convert;
}

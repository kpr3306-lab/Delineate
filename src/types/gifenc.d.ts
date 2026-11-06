declare module 'gifenc' {
  export type GifPalette = number[][];
  export type GifFormat = 'rgb565' | 'rgb444' | 'rgba4444';

  export type QuantizeOptions = {
    format?: GifFormat;
    oneBitAlpha?: boolean | number;
    clearAlpha?: boolean;
    clearAlphaColor?: number;
    clearAlphaThreshold?: number;
  };

  export type WriteFrameOptions = {
    palette?: GifPalette;
    delay?: number;
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    dispose?: number;
    first?: boolean;
  };

  export function quantize(
    data: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: QuantizeOptions,
  ): GifPalette;

  export function applyPalette(
    data: Uint8Array | Uint8ClampedArray,
    palette: GifPalette,
    format?: GifFormat,
  ): Uint8Array;

  export function GIFEncoder(options?: {
    auto?: boolean;
    initialCapacity?: number;
  }): {
    writeFrame: (
      index: Uint8Array,
      width: number,
      height: number,
      options?: WriteFrameOptions,
    ) => void;
    finish: () => void;
    bytes: () => Uint8Array<ArrayBuffer>;
    bytesView: () => Uint8Array<ArrayBuffer>;
    reset: () => void;
  };
}

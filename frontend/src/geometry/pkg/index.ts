// TypeScript drop-in for the Rust WASM package.
// Mirrors the exact same API as geometry/pkg built by wasm-pack.
// When you free disk space and run `wasm-pack build --target web`,
// the generated JS replaces this file seamlessly.

export class SnappedPosition {
  original_x: number;
  original_y: number;
  snapped_x: number;
  snapped_y: number;

  constructor(x: number, y: number, grid_size: number) {
    this.original_x = x;
    this.original_y = y;
    this.snapped_x = Math.round(x / grid_size) * grid_size;
    this.snapped_y = Math.round(y / grid_size) * grid_size;
  }
}

export default function init(): Promise<void> {
  return Promise.resolve();
}

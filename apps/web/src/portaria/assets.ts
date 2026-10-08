/**
 * WebAssembly files of the door, emitted by the bundler under `/_next/static/media/` with a
 * content hash: served by our origin (invariant 8) and safe to cache forever.
 */
export const CORE_WASM_URL = new URL(
  "../../../../packages/ticket-core-wasm/pkg/ticket_core_bg.wasm",
  import.meta.url,
).href;

export const ZXING_WASM_URL = new URL("../../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm", import.meta.url).href;

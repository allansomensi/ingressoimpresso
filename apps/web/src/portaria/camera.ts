/**
 * Camera + QR reading with zxing-wasm (ADR 0010), the same code path on Android and iPhone. The
 * WebAssembly file comes from our own origin, never from a CDN (invariant 8).
 */
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";

import { ZXING_WASM_URL } from "./assets";

/** Frames are downscaled to this many pixels on the longer side before decoding. */
const MAX_FRAME_PX = 720;
/** Pause between reads: enough for a responsive door without draining the battery. */
const READ_EVERY_MS = 120;
/**
 * Pause between reads while a result that waits for a tap is on screen: nothing new can replace
 * it, and a read every so often is enough to notice the same code still in view (the rescan
 * window is 5 s), so the decoder stops heating the phone for nothing.
 */
const IDLE_READ_EVERY_MS = 400;

let prepared = false;

function prepare(): void {
  if (prepared) {
    return;
  }
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? ZXING_WASM_URL : prefix + path),
    },
  });
  prepared = true;
}

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

export class Scanner {
  readonly #video: HTMLVideoElement;
  readonly #onTexts: (texts: string[]) => void;
  readonly #canvas = document.createElement("canvas");
  #stream: MediaStream | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #running = false;
  #idle = false;

  constructor(video: HTMLVideoElement, onTexts: (texts: string[]) => void) {
    this.#video = video;
    this.#onTexts = onTexts;
  }

  /** Opens the back camera and starts reading. Throws if the camera is unavailable. */
  async start(): Promise<void> {
    prepare();
    this.#stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    this.#video.srcObject = this.#stream;
    this.#video.muted = true;
    this.#video.playsInline = true;
    await this.#video.play();
    this.#running = true;
    this.#schedule();
  }

  stop(): void {
    this.#running = false;
    clearTimeout(this.#timer);
    for (const track of this.#stream?.getTracks() ?? []) {
      track.stop();
    }
    this.#stream = null;
    this.#video.srcObject = null;
  }

  get torchSupported(): boolean {
    const track = this.#stream?.getVideoTracks()[0];
    const capabilities: TorchCapabilities | undefined = track?.getCapabilities();
    return capabilities?.torch === true;
  }

  /** Slows the reads down (`true`) while a result holds the screen, or back to full speed. */
  setIdle(idle: boolean): void {
    this.#idle = idle;
  }

  async setTorch(on: boolean): Promise<void> {
    const track = this.#stream?.getVideoTracks()[0];
    // `torch` is not in the TypeScript DOM types yet.
    const constraint = { torch: on } as MediaTrackConstraintSet;
    await track?.applyConstraints({ advanced: [constraint] });
  }

  #schedule(): void {
    if (!this.#running) {
      return;
    }
    this.#timer = setTimeout(() => {
      void this.#readFrame().finally(() => {
        this.#schedule();
      });
    }, this.#idle ? IDLE_READ_EVERY_MS : READ_EVERY_MS);
  }

  async #readFrame(): Promise<void> {
    const video = this.#video;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width === 0 || height === 0) {
      return;
    }
    const scale = Math.min(1, MAX_FRAME_PX / Math.max(width, height));
    this.#canvas.width = Math.round(width * scale);
    this.#canvas.height = Math.round(height * scale);
    const context = this.#canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) {
      return;
    }
    context.drawImage(video, 0, 0, this.#canvas.width, this.#canvas.height);
    const image = context.getImageData(0, 0, this.#canvas.width, this.#canvas.height);
    const results = await readBarcodes(image, {
      formats: ["QRCode"],
      tryHarder: true,
      maxNumberOfSymbols: 4,
    });
    const texts = results.filter((result) => result.isValid && result.text !== "").map((result) => result.text);
    if (texts.length > 0) {
      this.#onTexts(texts);
    }
  }
}

/**
 * Reads the QR codes of a photo or screenshot, on this device (the public check of a ticket, ADR
 * 0075, uses the door's reader without the door's service worker).
 */
export async function readQrImage(image: Blob): Promise<string[]> {
  prepare();
  const results = await readBarcodes(image, { formats: ["QRCode"], tryHarder: true, maxNumberOfSymbols: 4 });
  return results.filter((result) => result.isValid && result.text !== "").map((result) => result.text);
}

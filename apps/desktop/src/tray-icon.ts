import { nativeImage } from "electron";
import type { NativeImage } from "electron";
import type { GatewayState } from "@easyclaw/gateway";

/**
 * Color palette for tray icon states.
 * Each color is an [r, g, b] tuple.
 */
const STATE_COLORS: Record<GatewayState, [number, number, number]> = {
  running: [76, 175, 80], // green
  starting: [255, 193, 7], // amber
  stopping: [255, 152, 0], // orange
  stopped: [158, 158, 158], // gray
};

/** Tray icon size in pixels (32x32 bitmap displayed at 16x16 @2x on retina). */
const SIZE = 32;
const HALF = SIZE / 2;

/**
 * Create a simple circular tray icon whose color reflects the gateway state.
 *
 * The icon is a 32x32 RGBA bitmap (displayed at 16x16 @2x on retina).
 * It draws a filled circle with a 1px darker border.
 */
export function createTrayIcon(state: GatewayState): NativeImage {
  const [r, g, b] = STATE_COLORS[state];

  // Darker border color (70% brightness)
  const br = Math.round(r * 0.7);
  const bg = Math.round(g * 0.7);
  const bb = Math.round(b * 0.7);

  const buffer = Buffer.alloc(SIZE * SIZE * 4);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - HALF + 0.5;
      const dy = y - HALF + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const offset = (y * SIZE + x) * 4;

      if (dist <= HALF - 1) {
        // Inner fill
        buffer[offset] = r;
        buffer[offset + 1] = g;
        buffer[offset + 2] = b;
        buffer[offset + 3] = 255;
      } else if (dist <= HALF) {
        // Border ring
        buffer[offset] = br;
        buffer[offset + 1] = bg;
        buffer[offset + 2] = bb;
        buffer[offset + 3] = 255;
      }
      // else: leave as zeros (transparent)
    }
  }

  return nativeImage.createFromBuffer(buffer, {
    width: SIZE,
    height: SIZE,
    scaleFactor: 2.0,
  });
}

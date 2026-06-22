import { useState, useEffect } from "react";
import init, { SnappedPosition } from "../geometry/pkg";

const GRID_SIZE = 20;

interface MousePosition {
  rawX: number;
  rawY: number;
  snappedX: number;
  snappedY: number;
}

export default function MouseTracker() {
  const [wasmReady, setWasmReady] = useState(false);
  const [pos, setPos] = useState<MousePosition>({
    rawX: 0, rawY: 0, snappedX: 0, snappedY: 0,
  });

  // Load WASM once on mount
  useEffect(() => {
    init().then(() => setWasmReady(true));
  }, []);

  // Listen to mouse movement over the canvas
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      // Only track when over a canvas element
      const target = e.target as HTMLElement;
      if (target.tagName !== "CANVAS") return;

      const canvas = target as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;

      if (wasmReady) {
        const snapped = new SnappedPosition(rawX, rawY, GRID_SIZE);
        setPos({
          rawX: Math.round(snapped.original_x),
          rawY: Math.round(snapped.original_y),
          snappedX: Math.round(snapped.snapped_x),
          snappedY: Math.round(snapped.snapped_y),
        });
      } else {
        // Fallback before WASM loads
        setPos({
          rawX: Math.round(rawX),
          rawY: Math.round(rawY),
          snappedX: Math.round(rawX / GRID_SIZE) * GRID_SIZE,
          snappedY: Math.round(rawY / GRID_SIZE) * GRID_SIZE,
        });
      }
    }

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [wasmReady]);

  return (
    <div className="flex items-center gap-4 px-4 py-1.5 bg-neutral-800 border-t border-neutral-700 text-xs font-mono text-neutral-400 select-none">
      <span>
        Raw:{" "}
        <span className="text-neutral-200">({pos.rawX}, {pos.rawY})</span>
      </span>
      <span className="text-neutral-600">→</span>
      <span>
        Snapped:{" "}
        <span className="text-emerald-400">({pos.snappedX}, {pos.snappedY})</span>
      </span>
      <span className="ml-auto text-neutral-600">
        Grid: {GRID_SIZE}px
      </span>
    </div>
  );
}

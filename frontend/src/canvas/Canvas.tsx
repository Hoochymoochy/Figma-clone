import { useRef, useEffect, useCallback } from "react";
import { useCanvasContext } from "./store.tsx";
import type { CanvasElement } from "./types.ts";
import { SnappedPosition } from "../geometry/pkg/index.ts";

const GRID_SIZE = 20;

// ---- viewport helpers -------------------------------------------------------

function screenToWorld(
  sx: number,
  sy: number,
  canvas: HTMLCanvasElement,
  zoom: number,
  offsetX: number,
  offsetY: number,
) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (sx - rect.left - offsetX) / zoom,
    y: (sy - rect.top - offsetY) / zoom,
  };
}

// ---- drawing helpers --------------------------------------------------------

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
) {
  // Scale grid spacing with zoom, clamp between reasonable values
  const baseSpacing = 20;
  let spacing = baseSpacing * zoom;

  // Snap to a cleaner grid at extreme zoom levels
  if (spacing < 10) spacing = baseSpacing * Math.ceil(10 / zoom) * zoom;
  if (spacing > 80) spacing = baseSpacing * Math.floor(80 / zoom) * zoom;

  const startX = offsetX % spacing;
  const startY = offsetY % spacing;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let x = startX; x <= width; x += spacing) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = startY; y <= height; y += spacing) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  isSelected: boolean,
) {
  ctx.save();

  if (el.type === "rectangle") {
    ctx.fillStyle = el.fill;
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;

    ctx.beginPath();
    ctx.rect(el.x, el.y, el.width, el.height);
    ctx.fill();
    if (el.strokeWidth > 0) ctx.stroke();
  } else if (el.type === "circle") {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const rx = el.width / 2;
    const ry = el.height / 2;

    ctx.fillStyle = el.fill;
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;

    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
    ctx.fill();
    if (el.strokeWidth > 0) ctx.stroke();
  }

  // Selection indicator
  if (isSelected) {
    ctx.strokeStyle = "#4A90D9";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(
      el.x - 4,
      el.y - 4,
      el.width + 8,
      el.height + 8,
    );
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function getElementBounds(el: CanvasElement) {
  return { left: el.x, top: el.y, right: el.x + el.width, bottom: el.y + el.height };
}

// ---- component --------------------------------------------------------------

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, dispatch, undo, redo } = useCanvasContext();

  // Track interaction state (not in React state to avoid re-renders)
  const interactionRef = useRef({
    isPanning: false,
    isDragging: false,
    spaceHeld: false,
    lastMouseX: 0,
    lastMouseY: 0,
    dragStartX: 0,
    dragStartY: 0,
    dragOrigins: null as { id: string; x: number; y: number }[] | null,
  });

  // ---- keyboard handlers ----------------------------------------------------

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Space → pan mode
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        interactionRef.current.spaceHeld = true;
        dispatch({ type: "SET_TOOL", tool: "pan" });
        return;
      }

      // Delete / Backspace → remove selected elements
      if (e.key === "Delete" || e.key === "Backspace") {
        // Don't delete if user is typing in an input
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        ) return;
        e.preventDefault();
        dispatch({ type: "DELETE_SELECTED" });
        return;
      }

      // Ctrl+Z → undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl+Y or Ctrl+Shift+Z → redo
      if (
        ((e.ctrlKey || e.metaKey) && e.key === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z")
      ) {
        e.preventDefault();
        redo();
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        interactionRef.current.spaceHeld = false;
        dispatch({ type: "SET_TOOL", tool: "select" });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [dispatch, undo, redo]);

  // ---- rendering ------------------------------------------------------------

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    const { offsetX, offsetY, zoom } = state.viewport;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, w, h);

    // Grid (in screen space)
    drawGrid(ctx, w, h, zoom, offsetX, offsetY);

    // World-space elements
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom, zoom);

    for (const el of state.elements) {
      const selected = state.selectedIds.includes(el.id);
      drawElement(ctx, el, selected);
    }

    ctx.restore();
  }, [state.viewport, state.elements, state.selectedIds]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        render();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [render]);

  // Re-render when state changes
  useEffect(() => {
    render();
  }, [render]);

  // ---- zoom -----------------------------------------------------------------

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { offsetX, offsetY, zoom } = state.viewport;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const newZoom = Math.min(5, Math.max(0.1, zoom * factor));

    // Zoom toward cursor
    const newOffsetX = mx - (mx - offsetX) * (newZoom / zoom);
    const newOffsetY = my - (my - offsetY) * (newZoom / zoom);

    dispatch({
      type: "SET_VIEWPORT",
      viewport: { offsetX: newOffsetX, offsetY: newOffsetY, zoom: newZoom },
    });
  }

  // ---- mouse / pointer ------------------------------------------------------

  function getWorldPos(e: React.MouseEvent) {
    const canvas = canvasRef.current!;
    return screenToWorld(
      e.clientX,
      e.clientY,
      canvas,
      state.viewport.zoom,
      state.viewport.offsetX,
      state.viewport.offsetY,
    );
  }

  function hitTest(wx: number, wy: number): CanvasElement | null {
    // Reverse to test top-most elements first
    for (let i = state.elements.length - 1; i >= 0; i--) {
      const el = state.elements[i];
      const b = getElementBounds(el);
      if (wx >= b.left && wx <= b.right && wy >= b.top && wy <= b.bottom) {
        return el;
      }
    }
    return null;
  }

  function handleMouseDown(e: React.MouseEvent) {
    const ir = interactionRef.current;
    const tool = state.tool;

    // Middle mouse or pan tool → pan
    if (e.button === 1 || tool === "pan") {
      ir.isPanning = true;
      ir.lastMouseX = e.clientX;
      ir.lastMouseY = e.clientY;
      return;
    }

    // Select tool → pick & drag
    const world = getWorldPos(e);
    const hit = hitTest(world.x, world.y);

    if (hit) {
      if (!state.selectedIds.includes(hit.id)) {
        dispatch({ type: "SET_SELECTION", ids: [hit.id] });
      }
      ir.isDragging = true;
      ir.dragStartX = world.x;
      ir.dragStartY = world.y;
      ir.dragOrigins = state.selectedIds.map((id) => {
        const el = state.elements.find((x) => x.id === id)!;
        return { id: el.id, x: el.x, y: el.y };
      });
    } else {
      dispatch({ type: "CLEAR_SELECTION" });
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    const ir = interactionRef.current;

    if (ir.isPanning) {
      const dx = e.clientX - ir.lastMouseX;
      const dy = e.clientY - ir.lastMouseY;
      ir.lastMouseX = e.clientX;
      ir.lastMouseY = e.clientY;
      dispatch({
        type: "SET_VIEWPORT",
        viewport: {
          offsetX: state.viewport.offsetX + dx,
          offsetY: state.viewport.offsetY + dy,
        },
      });
      return;
    }

    if (ir.isDragging && ir.dragOrigins) {
      const world = getWorldPos(e);
      const dx = world.x - ir.dragStartX;
      const dy = world.y - ir.dragStartY;
      for (const { id, x, y } of ir.dragOrigins) {
        const rawX = x + dx;
        const rawY = y + dy;
        const snapped = new SnappedPosition(rawX, rawY, GRID_SIZE);
        dispatch({
          type: "UPDATE_ELEMENT",
          id,
          changes: { x: snapped.snapped_x, y: snapped.snapped_y },
        });
      }
      return;
    }

  }

  function handleMouseUp(_e: React.MouseEvent) {
    const ir = interactionRef.current;

    if (ir.isPanning) {
      ir.isPanning = false;
      return;
    }

    if (ir.isDragging) {
      ir.isDragging = false;
      ir.dragOrigins = null;
    }
  }

  // Determine cursor
  function getCursor(): string {
    const ir = interactionRef.current;
    if (ir.isPanning) return "grabbing";
    if (ir.isDragging) return "move";
    if (state.tool === "pan") return "grab";
    return "default";
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden bg-neutral-900"
      style={{ touchAction: "none" }}
    >
      <canvas
        ref={canvasRef}
        className="block"
        style={{ cursor: getCursor() }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

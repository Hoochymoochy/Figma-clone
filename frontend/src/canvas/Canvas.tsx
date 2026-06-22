import { useRef, useEffect, useCallback } from "react";
import { useCanvasContext } from "./store.tsx";
import type { CanvasElement, Measurement, Point, PolygonElement, Tool } from "./types.ts";
import { SnappedPosition } from "../geometry/pkg/index.ts";

const GRID_SIZE = 20;
const VERTEX_HIT_PX = 8;
const EDGE_HIT_PX = 10;
const MIN_POLYGON_POINTS = 3;

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

function boundsFromPoints(points: Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
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
  } else if (el.type === "polygon") {
    if (el.points.length < 2) {
      ctx.restore();
      return;
    }

    ctx.fillStyle = el.fill;
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;

    ctx.beginPath();
    ctx.moveTo(el.points[0].x, el.points[0].y);
    for (let i = 1; i < el.points.length; i++) {
      ctx.lineTo(el.points[i].x, el.points[i].y);
    }
    ctx.closePath();
    ctx.fill();
    if (el.strokeWidth > 0) ctx.stroke();
  }

  // Selection indicator
  if (isSelected) {
    ctx.strokeStyle = "#4A90D9";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);

    if (el.type === "polygon") {
      const b = boundsFromPoints(el.points);
      ctx.strokeRect(b.left - 4, b.top - 4, b.right - b.left + 8, b.bottom - b.top + 8);
    } else {
      ctx.strokeRect(
        el.x - 4,
        el.y - 4,
        el.width + 8,
        el.height + 8,
      );
    }

    ctx.setLineDash([]);
  }

  ctx.restore();
}

function getElementBounds(el: CanvasElement) {
  if (el.type === "polygon") {
    return boundsFromPoints(el.points);
  }
  return { left: el.x, top: el.y, right: el.x + el.width, bottom: el.y + el.height };
}

function distance(ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

function projectPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Point {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: ax, y: ay };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return { x: ax + t * dx, y: ay + t * dy };
}

function hitTestVertex(
  points: Point[],
  wx: number,
  wy: number,
  hitRadius: number,
): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const pt = points[i];
    if (distance(wx, wy, pt.x, pt.y) <= hitRadius) return i;
  }
  return null;
}

function hitTestEdge(
  points: Point[],
  wx: number,
  wy: number,
  hitRadius: number,
): { edgeIndex: number; point: Point } | null {
  let best: { edgeIndex: number; point: Point; dist: number } | null = null;

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const projected = projectPointOnSegment(wx, wy, a.x, a.y, b.x, b.y);
    const dist = distance(wx, wy, projected.x, projected.y);
    if (dist <= hitRadius && (!best || dist < best.dist)) {
      best = { edgeIndex: i, point: projected, dist };
    }
  }

  return best ? { edgeIndex: best.edgeIndex, point: best.point } : null;
}

function drawVertexHandles(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  selectedIndex: number | null,
  zoom: number,
) {
  const radius = 5;
  const strokeWidth = 2 / zoom;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const selected = i === selectedIndex;

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = selected ? "#ffffff" : "#4A90D9";
    ctx.fill();
    ctx.strokeStyle = selected ? "#4A90D9" : "#ffffff";
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}

function gridDelta(a: Point, b: Point) {
  return {
    dx: (b.x - a.x) / GRID_SIZE,
    dy: (b.y - a.y) / GRID_SIZE,
  };
}

function gridDistance(a: Point, b: Point) {
  const { dx, dy } = gridDelta(a, b);
  return Math.sqrt(dx * dx + dy * dy);
}

function formatGridUnits(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function drawMeasurement(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  zoom: number,
  isPreview = false,
) {
  const { dx, dy } = gridDelta(start, end);
  const dist = gridDistance(start, end);
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  const stroke = isPreview ? "rgba(255, 180, 60, 0.85)" : "#FFB43C";
  const endpointRadius = 4;
  const crosshairSize = 6 / zoom;
  const fontSize = 12 / zoom;
  const padding = 4 / zoom;

  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.fillStyle = stroke;
  ctx.lineWidth = 1.5 / zoom;

  // Main line
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  // Endpoint markers
  for (const pt of [start, end]) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, endpointRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(pt.x - crosshairSize, pt.y);
    ctx.lineTo(pt.x + crosshairSize, pt.y);
    ctx.moveTo(pt.x, pt.y - crosshairSize);
    ctx.lineTo(pt.x, pt.y + crosshairSize);
    ctx.stroke();
  }

  // Axis guides (dashed right-angle triangle)
  ctx.setLineDash([4 / zoom, 4 / zoom]);
  ctx.strokeStyle = isPreview ? "rgba(255, 180, 60, 0.45)" : "rgba(255, 180, 60, 0.65)";
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Distance label at midpoint
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const label =
    absDx === 0 && absDy === 0
      ? "0"
      : `${formatGridUnits(absDx)} × ${formatGridUnits(absDy)}  (${formatGridUnits(dist)})`;

  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const metrics = ctx.measureText(label);
  const boxW = metrics.width + padding * 2;
  const boxH = fontSize + padding * 2;

  ctx.fillStyle = "rgba(26, 26, 26, 0.9)";
  ctx.fillRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH);

  ctx.fillStyle = stroke;
  ctx.fillText(label, midX, midY);

  ctx.restore();
}

function drawElementLabel(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  zoom: number,
) {
  if (!el.label?.trim()) return;

  const bounds = getElementBounds(el);
  const labelX = (bounds.left + bounds.right) / 2;
  const labelY = bounds.top - 6 / zoom;

  const fontSize = 12 / zoom;
  const padding = 4 / zoom;
  const label = el.label.trim();

  ctx.save();
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  const metrics = ctx.measureText(label);
  const boxW = metrics.width + padding * 2;
  const boxH = fontSize + padding * 2;

  ctx.fillStyle = "rgba(26, 26, 26, 0.9)";
  ctx.fillRect(labelX - boxW / 2, labelY - boxH, boxW, boxH);

  ctx.fillStyle = "#a8d4ff";
  ctx.fillText(label, labelX, labelY - padding / 2);

  ctx.restore();
}

function drawPolygonDraft(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  previewPoint: Point | null,
) {
  if (points.length === 0) return;

  ctx.strokeStyle = "#4A90D9";
  ctx.fillStyle = "rgba(74, 144, 217, 0.15)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  if (previewPoint) {
    ctx.lineTo(previewPoint.x, previewPoint.y);
  }
  ctx.stroke();

  if (points.length >= 3 && previewPoint) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.lineTo(previewPoint.x, previewPoint.y);
    ctx.closePath();
    ctx.fill();
  }

  for (const pt of points) {
    ctx.beginPath();
    ctx.fillStyle = "#4A90D9";
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- component --------------------------------------------------------------

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, dispatch, undo, redo } = useCanvasContext();

  const renderRef = useRef<() => void>(() => {});

  // Track interaction state (not in React state to avoid re-renders)
  const interactionRef = useRef({
    isPanning: false,
    isDragging: false,
    spaceHeld: false,
    toolBeforeSpace: "select" as Tool,
    lastMouseX: 0,
    lastMouseY: 0,
    dragStartX: 0,
    dragStartY: 0,
    dragOrigins: null as
      | { id: string; x: number; y: number; points?: Point[] }[]
      | null,
    polygonDraft: null as { points: Point[]; previewPoint: Point | null } | null,
    measureDraft: null as { start: Point; previewEnd: Point } | null,
    measurements: [] as Measurement[],
    pointEdit: null as { elementId: string; selectedPointIndex: number | null } | null,
    draggingPointIndex: null as number | null,
  });

  // ---- keyboard handlers ----------------------------------------------------

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Space → pan mode
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        const ir = interactionRef.current;
        ir.spaceHeld = true;
        ir.toolBeforeSpace = state.tool;
        dispatch({ type: "SET_TOOL", tool: "pan" });
        return;
      }

      // Enter → close polygon
      if (e.key === "Enter" && state.tool === "polygon") {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        ) return;
        e.preventDefault();
        const draft = interactionRef.current.polygonDraft;
        if (draft && draft.points.length >= 3) {
          commitPolygon(draft.points);
        }
        return;
      }

      // Escape → cancel polygon draft, measure draft, or exit point edit
      if (e.key === "Escape") {
        const ir = interactionRef.current;
        if (ir.pointEdit) {
          e.preventDefault();
          ir.pointEdit = null;
          ir.draggingPointIndex = null;
          renderRef.current();
          return;
        }
        if (ir.polygonDraft) {
          e.preventDefault();
          ir.polygonDraft = null;
          renderRef.current();
          return;
        }
        if (ir.measureDraft) {
          e.preventDefault();
          ir.measureDraft = null;
          renderRef.current();
          return;
        }
        if (state.tool === "measure" && ir.measurements.length > 0) {
          e.preventDefault();
          ir.measurements = [];
          renderRef.current();
          return;
        }
        if (state.tool === "annotate" && state.selectedIds.length > 0) {
          e.preventDefault();
          dispatch({ type: "CLEAR_SELECTION" });
          return;
        }
        return;
      }

      // Delete / Backspace → remove selected vertex or selected elements
      if (e.key === "Delete" || e.key === "Backspace") {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        ) return;

        const ir = interactionRef.current;
        if (ir.pointEdit && ir.pointEdit.selectedPointIndex !== null) {
          const el = state.elements.find((x) => x.id === ir.pointEdit!.elementId);
          if (el?.type === "polygon" && el.points.length > MIN_POLYGON_POINTS) {
            e.preventDefault();
            const idx = ir.pointEdit.selectedPointIndex;
            const newPoints = el.points.filter((_, i) => i !== idx);
            dispatch({
              type: "UPDATE_ELEMENT",
              id: el.id,
              changes: { points: newPoints },
            });
            ir.pointEdit.selectedPointIndex = null;
            renderRef.current();
          }
          return;
        }

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
        const ir = interactionRef.current;
        ir.spaceHeld = false;
        dispatch({ type: "SET_TOOL", tool: ir.toolBeforeSpace });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [dispatch, undo, redo, state.tool, state.elements]);

  function commitPolygon(points: Point[]) {
    const element: PolygonElement = {
      id: crypto.randomUUID(),
      type: "polygon",
      points,
      fill: "rgba(74, 144, 217, 0.5)",
      stroke: "#4A90D9",
      strokeWidth: 2,
    };
    dispatch({ type: "ADD_ELEMENT", element });
    dispatch({ type: "SET_SELECTION", ids: [element.id] });
    interactionRef.current.polygonDraft = null;
    dispatch({ type: "SET_TOOL", tool: "select" });
  }

  function snapPoint(wx: number, wy: number): Point {
    const snapped = new SnappedPosition(wx, wy, GRID_SIZE);
    return { x: snapped.snapped_x, y: snapped.snapped_y };
  }

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
      drawElementLabel(ctx, el, zoom);
    }

    const draft = interactionRef.current.polygonDraft;
    if (draft) {
      drawPolygonDraft(ctx, draft.points, draft.previewPoint);
    }

    for (const m of interactionRef.current.measurements) {
      drawMeasurement(ctx, m.start, m.end, zoom);
    }

    const measureDraft = interactionRef.current.measureDraft;
    if (measureDraft) {
      drawMeasurement(ctx, measureDraft.start, measureDraft.previewEnd, zoom, true);
    }

    const pointEdit = interactionRef.current.pointEdit;
    if (pointEdit) {
      const el = state.elements.find((e) => e.id === pointEdit.elementId);
      if (el?.type === "polygon") {
        drawVertexHandles(
          ctx,
          el.points,
          pointEdit.selectedPointIndex,
          zoom,
        );
      }
    }

    ctx.restore();
  }, [state.viewport, state.elements, state.selectedIds]);

  renderRef.current = render;

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

  // Clear polygon/measure drafts when leaving those tools (but not during space-pan)
  useEffect(() => {
    if (state.tool !== "polygon" && !interactionRef.current.spaceHeld) {
      interactionRef.current.polygonDraft = null;
      renderRef.current();
    }
    if (state.tool !== "measure" && !interactionRef.current.spaceHeld) {
      interactionRef.current.measureDraft = null;
      interactionRef.current.measurements = [];
      renderRef.current();
    }
    if (state.tool !== "select") {
      interactionRef.current.pointEdit = null;
      interactionRef.current.draggingPointIndex = null;
      renderRef.current();
    }
  }, [state.tool]);

  // Exit point edit if the polygon was removed
  useEffect(() => {
    const pe = interactionRef.current.pointEdit;
    if (!pe) return;
    const el = state.elements.find((e) => e.id === pe.elementId);
    if (!el || el.type !== "polygon") {
      interactionRef.current.pointEdit = null;
      interactionRef.current.draggingPointIndex = null;
      renderRef.current();
    }
  }, [state.elements]);

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

  function getPolygonBeingEdited(): PolygonElement | null {
    const pe = interactionRef.current.pointEdit;
    if (!pe) return null;
    const el = state.elements.find((e) => e.id === pe.elementId);
    return el?.type === "polygon" ? el : null;
  }

  function handleDoubleClick(e: React.MouseEvent) {
    if (state.tool !== "select") return;

    const world = getWorldPos(e);
    const hit = hitTest(world.x, world.y);
    if (hit?.type !== "polygon") return;

    const ir = interactionRef.current;
    ir.pointEdit = { elementId: hit.id, selectedPointIndex: null };
    ir.isDragging = false;
    ir.dragOrigins = null;
    ir.draggingPointIndex = null;
    dispatch({ type: "SET_SELECTION", ids: [hit.id] });
    renderRef.current();
  }

  function handlePointEditMouseDown(world: Point) {
    const ir = interactionRef.current;
    const el = getPolygonBeingEdited();
    if (!el || !ir.pointEdit) return false;

    const hitRadius = VERTEX_HIT_PX / state.viewport.zoom;
    const edgeHitRadius = EDGE_HIT_PX / state.viewport.zoom;

    const vertexIndex = hitTestVertex(el.points, world.x, world.y, hitRadius);
    if (vertexIndex !== null) {
      ir.pointEdit.selectedPointIndex = vertexIndex;
      ir.draggingPointIndex = vertexIndex;
      ir.isDragging = false;
      ir.dragOrigins = null;
      renderRef.current();
      return true;
    }

    const edge = hitTestEdge(el.points, world.x, world.y, edgeHitRadius);
    if (edge) {
      const newPoint = snapPoint(edge.point.x, edge.point.y);
      const newPoints = [...el.points];
      newPoints.splice(edge.edgeIndex + 1, 0, newPoint);
      dispatch({
        type: "UPDATE_ELEMENT",
        id: el.id,
        changes: { points: newPoints },
      });
      ir.pointEdit.selectedPointIndex = edge.edgeIndex + 1;
      ir.draggingPointIndex = edge.edgeIndex + 1;
      renderRef.current();
      return true;
    }

    const hit = hitTest(world.x, world.y);
    if (hit?.id === el.id) {
      ir.pointEdit.selectedPointIndex = null;
      renderRef.current();
      return true;
    }

    ir.pointEdit = null;
    ir.draggingPointIndex = null;
    renderRef.current();
    return false;
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

    // Polygon tool → place vertices
    if (tool === "polygon") {
      if (e.button !== 0) return;

      const world = getWorldPos(e);
      const draft = ir.polygonDraft;

      // Double-click closes the polygon (detail >= 2 on the second click)
      if (e.detail >= 2 && draft && draft.points.length >= 3) {
        commitPolygon(draft.points);
        return;
      }

      const pt = snapPoint(world.x, world.y);

      if (!draft) {
        ir.polygonDraft = { points: [pt], previewPoint: pt };
      } else {
        draft.points.push(pt);
        draft.previewPoint = pt;
      }

      renderRef.current();
      return;
    }

    // Measure tool → place endpoints on grid
    if (tool === "measure") {
      if (e.button !== 0) return;

      const world = getWorldPos(e);
      const pt = snapPoint(world.x, world.y);
      const draft = ir.measureDraft;

      if (!draft) {
        ir.measureDraft = { start: pt, previewEnd: pt };
      } else {
        ir.measurements.push({ start: draft.start, end: pt });
        ir.measureDraft = null;
      }

      renderRef.current();
      return;
    }

    // Annotate tool → select shape for labeling
    if (tool === "annotate") {
      if (e.button !== 0) return;

      const world = getWorldPos(e);
      const hit = hitTest(world.x, world.y);

      if (hit) {
        dispatch({ type: "SET_SELECTION", ids: [hit.id] });
      } else {
        dispatch({ type: "CLEAR_SELECTION" });
      }
      return;
    }

    // Select tool → point edit, pick & drag
    const world = getWorldPos(e);

    if (tool === "select" && ir.pointEdit) {
      if (handlePointEditMouseDown(world)) return;
    }

    const hit = hitTest(world.x, world.y);

    if (hit) {
      if (!state.selectedIds.includes(hit.id)) {
        dispatch({ type: "SET_SELECTION", ids: [hit.id] });
      }
      if (ir.pointEdit) {
        ir.pointEdit = null;
        ir.draggingPointIndex = null;
      }
      ir.isDragging = true;
      ir.dragStartX = world.x;
      ir.dragStartY = world.y;
      ir.dragOrigins = state.selectedIds.map((id) => {
        const el = state.elements.find((x) => x.id === id)!;
        if (el.type === "polygon") {
          return {
            id: el.id,
            x: 0,
            y: 0,
            points: el.points.map((p) => ({ ...p })),
          };
        }
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

    if (ir.draggingPointIndex !== null && ir.pointEdit) {
      const world = getWorldPos(e);
      const el = getPolygonBeingEdited();
      if (el) {
        const pt = snapPoint(world.x, world.y);
        const newPoints = el.points.map((p, i) =>
          i === ir.draggingPointIndex ? pt : p,
        );
        dispatch({
          type: "UPDATE_ELEMENT",
          id: el.id,
          changes: { points: newPoints },
        });
      }
      return;
    }

    if (ir.isDragging && ir.dragOrigins) {
      const world = getWorldPos(e);
      const dx = world.x - ir.dragStartX;
      const dy = world.y - ir.dragStartY;
      for (const origin of ir.dragOrigins) {
        if (origin.points) {
          const firstX = origin.points[0].x + dx;
          const firstY = origin.points[0].y + dy;
          const snapped = new SnappedPosition(firstX, firstY, GRID_SIZE);
          const totalDx = snapped.snapped_x - origin.points[0].x;
          const totalDy = snapped.snapped_y - origin.points[0].y;
          dispatch({
            type: "UPDATE_ELEMENT",
            id: origin.id,
            changes: {
              points: origin.points.map((p) => ({
                x: p.x + totalDx,
                y: p.y + totalDy,
              })),
            },
          });
        } else {
          const rawX = origin.x + dx;
          const rawY = origin.y + dy;
          const snapped = new SnappedPosition(rawX, rawY, GRID_SIZE);
          dispatch({
            type: "UPDATE_ELEMENT",
            id: origin.id,
            changes: { x: snapped.snapped_x, y: snapped.snapped_y },
          });
        }
      }
      return;
    }

    if (state.tool === "polygon" && ir.polygonDraft) {
      const world = getWorldPos(e);
      ir.polygonDraft.previewPoint = snapPoint(world.x, world.y);
      renderRef.current();
    }

    if (state.tool === "measure" && ir.measureDraft) {
      const world = getWorldPos(e);
      ir.measureDraft.previewEnd = snapPoint(world.x, world.y);
      renderRef.current();
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

    if (ir.draggingPointIndex !== null) {
      ir.draggingPointIndex = null;
    }
  }

  // Determine cursor
  function getCursor(): string {
    const ir = interactionRef.current;
    if (ir.isPanning) return "grabbing";
    if (ir.draggingPointIndex !== null) return "grabbing";
    if (ir.isDragging) return "move";
    if (state.tool === "pan") return "grab";
    if (state.tool === "polygon" || state.tool === "measure") return "crosshair";
    if (state.tool === "annotate") return "pointer";
    if (ir.pointEdit) return "crosshair";
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
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

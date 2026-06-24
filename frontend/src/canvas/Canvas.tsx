import { useRef, useEffect, useCallback } from "react";
import { useCanvasContext } from "./store.tsx";
import type { Measurement, Point, PolygonElement, Tool } from "./types.ts";
import {
  snapPoint,
  findNeighborsForShape,
  hitTest as geomHitTest,
  measureDistance,
  GRID_SIZE,
} from "../geometry/scene.ts";
import {
  drawGrid,
  drawElement,
  drawVertexHandles,
  drawMeasurement,
  drawElementLabel,
  drawPolygonDraft,
} from "./renderer.ts";

const VERTEX_HIT_PX = 8;
const EDGE_HIT_PX = 10;
const MIN_POLYGON_POINTS = 3;

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
    const neighbors = findNeighborsForShape(element);
    if (neighbors.length > 0) {
      console.debug("[geometry] polygon neighbors:", neighbors);
    }
    dispatch({ type: "ADD_ELEMENT", element });
    dispatch({ type: "SET_SELECTION", ids: [element.id] });
    interactionRef.current.polygonDraft = null;
    dispatch({ type: "SET_TOOL", tool: "select" });
  }

  function snapWorldPoint(wx: number, wy: number): Point {
    return snapPoint(wx, wy, GRID_SIZE);
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
      drawMeasurement(ctx, m.start, m.end, measureDistance(m.start, m.end), zoom);
    }

    const measureDraft = interactionRef.current.measureDraft;
    if (measureDraft) {
      drawMeasurement(
        ctx,
        measureDraft.start,
        measureDraft.previewEnd,
        measureDistance(measureDraft.start, measureDraft.previewEnd),
        zoom,
        true,
      );
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

  function pickShape(wx: number, wy: number) {
    const result = geomHitTest(wx, wy, VERTEX_HIT_PX / state.viewport.zoom, null);
    if (!result || result.kind !== "body") return null;
    return state.elements.find((el) => el.id === result.shape_id) ?? null;
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
    const hit = pickShape(world.x, world.y);
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

    const hitRadius = Math.max(VERTEX_HIT_PX, EDGE_HIT_PX) / state.viewport.zoom;
    const result = geomHitTest(world.x, world.y, hitRadius, el.id);

    if (result?.kind === "vertex" && result.vertex_index != null) {
      ir.pointEdit.selectedPointIndex = result.vertex_index;
      ir.draggingPointIndex = result.vertex_index;
      ir.isDragging = false;
      ir.dragOrigins = null;
      renderRef.current();
      return true;
    }

    if (result?.kind === "edge" && result.edge_index != null) {
      const newPoint = snapWorldPoint(result.point.x, result.point.y);
      const newPoints = [...el.points];
      newPoints.splice(result.edge_index + 1, 0, newPoint);
      dispatch({
        type: "UPDATE_ELEMENT",
        id: el.id,
        changes: { points: newPoints },
      });
      ir.pointEdit.selectedPointIndex = result.edge_index + 1;
      ir.draggingPointIndex = result.edge_index + 1;
      renderRef.current();
      return true;
    }

    const hit = pickShape(world.x, world.y);
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

      const pt = snapWorldPoint(world.x, world.y);

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
      const pt = snapWorldPoint(world.x, world.y);
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
      const hit = pickShape(world.x, world.y);

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

    const hit = pickShape(world.x, world.y);

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
        const pt = snapWorldPoint(world.x, world.y);
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
          const snapped = snapPoint(firstX, firstY, GRID_SIZE);
          const totalDx = snapped.x - origin.points[0].x;
          const totalDy = snapped.y - origin.points[0].y;
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
          const snapped = snapPoint(rawX, rawY, GRID_SIZE);
          dispatch({
            type: "UPDATE_ELEMENT",
            id: origin.id,
            changes: { x: snapped.x, y: snapped.y },
          });
        }
      }
      return;
    }

    if (state.tool === "polygon" && ir.polygonDraft) {
      const world = getWorldPos(e);
      ir.polygonDraft.previewPoint = snapWorldPoint(world.x, world.y);
      renderRef.current();
    }

    if (state.tool === "measure" && ir.measureDraft) {
      const world = getWorldPos(e);
      ir.measureDraft.previewEnd = snapWorldPoint(world.x, world.y);
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

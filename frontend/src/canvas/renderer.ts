import type { CanvasElement, Point } from "./types.ts";
import type { MeasureResult } from "../geometry/types.ts";
import { getShapeBounds } from "../geometry/scene.ts";

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function fallbackBounds(el: CanvasElement): Bounds {
  if (el.type === "polygon") {
    const xs = el.points.map((p) => p.x);
    const ys = el.points.map((p) => p.y);
    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    };
  }
  return {
    left: el.x,
    top: el.y,
    right: el.x + el.width,
    bottom: el.y + el.height,
  };
}

export function boundsForElement(el: CanvasElement): Bounds {
  return getShapeBounds(el.id) ?? fallbackBounds(el);
}

export function formatGridUnits(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
) {
  const baseSpacing = 20;
  let spacing = baseSpacing * zoom;

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

export function drawElement(
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

  if (isSelected) {
    const b = boundsForElement(el);
    ctx.strokeStyle = "#4A90D9";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(b.left - 4, b.top - 4, b.right - b.left + 8, b.bottom - b.top + 8);
    ctx.setLineDash([]);
  }

  ctx.restore();
}

export function drawVertexHandles(
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

export function drawMeasurement(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  measure: MeasureResult,
  zoom: number,
  isPreview = false,
) {
  const absDx = Math.abs(measure.grid_dx);
  const absDy = Math.abs(measure.grid_dy);

  const stroke = isPreview ? "rgba(255, 180, 60, 0.85)" : "#FFB43C";
  const endpointRadius = 4;
  const crosshairSize = 6 / zoom;
  const fontSize = 12 / zoom;
  const padding = 4 / zoom;

  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.fillStyle = stroke;
  ctx.lineWidth = 1.5 / zoom;

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

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

  ctx.setLineDash([4 / zoom, 4 / zoom]);
  ctx.strokeStyle = isPreview ? "rgba(255, 180, 60, 0.45)" : "rgba(255, 180, 60, 0.65)";
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const label =
    absDx === 0 && absDy === 0
      ? "0"
      : `${formatGridUnits(absDx)} × ${formatGridUnits(absDy)}  (${formatGridUnits(measure.grid_distance)})`;

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

export function drawElementLabel(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  zoom: number,
) {
  if (!el.label?.trim()) return;

  const bounds = boundsForElement(el);
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

export function drawPolygonDraft(
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

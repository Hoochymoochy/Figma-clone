import init, { Scene } from "./pkg/geom_wasm.js";
import type { CanvasElement, ElementUpdate, Point } from "../canvas/types.ts";
import type { Bounds, HitResult, MeasureResult, Route } from "./types.ts";

export const GRID_SIZE = 20;
export const NEARBY_MARGIN = 8;

let wasmReady = false;
let scene: Scene | null = null;
let initPromise: Promise<void> | null = null;

function requireScene(): Scene {
  if (!scene) throw new Error("Geometry scene not initialized");
  return scene;
}

export async function initGeometry(): Promise<void> {
  if (wasmReady) return;
  if (!initPromise) {
    initPromise = init().then(() => {
      scene = new Scene(GRID_SIZE);
      wasmReady = true;
    });
  }
  await initPromise;
}

export function isGeometryReady(): boolean {
  return wasmReady;
}

export function exportElements(): CanvasElement[] {
  if (!wasmReady || !scene) return [];
  return JSON.parse(scene.export_shapes_json()) as CanvasElement[];
}

export function exportRoutes(): Route[] {
  if (!wasmReady || !scene) return [];
  return JSON.parse(scene.export_routes_json()) as Route[];
}

export function importShapes(elements: CanvasElement[]): void {
  if (!wasmReady || !scene) return;
  scene.import_shapes_from_json(JSON.stringify(elements));
}

export function addShape(element: CanvasElement): CanvasElement[] {
  requireScene().add_shape_json(JSON.stringify(element));
  return exportElements();
}

export function updateShape(id: string, changes: ElementUpdate): CanvasElement[] {
  requireScene().update_shape(id, JSON.stringify(changes));
  return exportElements();
}

export function removeShape(id: string): CanvasElement[] {
  requireScene().remove_shape(id);
  return exportElements();
}

export function removeShapes(ids: string[]): CanvasElement[] {
  requireScene().remove_shapes_json(JSON.stringify(ids));
  return exportElements();
}

export function snapPoint(
  x: number,
  y: number,
  gridSize = GRID_SIZE,
): Point {
  if (wasmReady && scene) {
    return JSON.parse(scene.snap_point(x, y)) as Point;
  }
  return {
    x: Math.round(x / gridSize) * gridSize,
    y: Math.round(y / gridSize) * gridSize,
  };
}

export function hitTest(
  x: number,
  y: number,
  vertexRadius: number,
  editShapeId?: string | null,
): HitResult | null {
  if (!wasmReady || !scene) return null;
  const result = JSON.parse(
    scene.hit_test(x, y, vertexRadius, editShapeId ?? undefined),
  ) as HitResult | null;
  return result;
}

export function measureDistance(
  start: Point,
  end: Point,
): MeasureResult {
  if (!wasmReady || !scene) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const grid_dx = dx / GRID_SIZE;
    const grid_dy = dy / GRID_SIZE;
    return {
      distance: Math.hypot(dx, dy),
      dx,
      dy,
      grid_dx,
      grid_dy,
      grid_distance: Math.hypot(grid_dx, grid_dy),
    };
  }
  return JSON.parse(
    scene.measure_distance(start.x, start.y, end.x, end.y),
  ) as MeasureResult;
}

export function getShapeBounds(id: string): Bounds | null {
  if (!wasmReady || !scene) return null;
  const result = JSON.parse(scene.shape_bounds(id)) as Bounds | null;
  return result;
}

export function findNeighborsForShape(
  shape: CanvasElement,
  margin = NEARBY_MARGIN,
): string[] {
  if (!wasmReady || !scene) return [];
  const result = JSON.parse(
    scene.find_neighbors_for_shape_json(JSON.stringify(shape), margin),
  ) as { neighbors: string[] };
  return result.neighbors ?? [];
}

export function findNeighbors(id: string, margin = NEARBY_MARGIN): string[] {
  if (!wasmReady || !scene) return [];
  const result = JSON.parse(scene.find_neighbors(id, margin)) as {
    neighbors: string[];
  };
  return result.neighbors ?? [];
}

export function createRoute(route: Route): void {
  requireScene().create_route_json(JSON.stringify(route));
}

export function routeIntersects(routeId: string): string[] {
  if (!wasmReady || !scene) return [];
  const result = JSON.parse(scene.route_intersects(routeId)) as {
    intersections: string[];
  };
  return result.intersections ?? [];
}

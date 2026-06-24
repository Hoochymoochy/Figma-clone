import type { Point } from "../canvas/types.ts";

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type HitKind = "body" | "vertex" | "edge";

export interface HitResult {
  shape_id: string;
  kind: HitKind;
  vertex_index?: number;
  edge_index?: number;
  point: Point;
  distance: number;
}

export interface MeasureResult {
  distance: number;
  dx: number;
  dy: number;
  grid_dx: number;
  grid_dy: number;
  grid_distance: number;
}

export interface RouteSegment {
  from: Point;
  to: Point;
}

export interface Route {
  id: string;
  segments: RouteSegment[];
  width?: number;
  layer_id?: string;
  stroke?: string;
}

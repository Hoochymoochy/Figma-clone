export type ShapeType = "rectangle" | "circle" | "polygon";

export interface Point {
  x: number;
  y: number;
}

interface BaseElement {
  id: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  label?: string;
}

export interface RectElement extends BaseElement {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CircleElement extends BaseElement {
  type: "circle";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PolygonElement extends BaseElement {
  type: "polygon";
  points: Point[];
}

export type CanvasElement = RectElement | CircleElement | PolygonElement;

export type ElementUpdate = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  points?: Point[];
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  label?: string;
};

export interface Viewport {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export type Tool = "select" | "pan" | "polygon" | "measure" | "annotate";

export interface Measurement {
  start: Point;
  end: Point;
}

export interface CanvasState {
  elements: CanvasElement[];
  selectedIds: string[];
  viewport: Viewport;
  tool: Tool;
}

export type CanvasAction =
  | { type: "ADD_ELEMENT"; element: CanvasElement }
  | { type: "UPDATE_ELEMENT"; id: string; changes: ElementUpdate }
  | { type: "DELETE_ELEMENT"; id: string }
  | { type: "DELETE_SELECTED" }
  | { type: "SET_SELECTION"; ids: string[] }
  | { type: "CLEAR_SELECTION" }
  | { type: "SET_VIEWPORT"; viewport: Partial<Viewport> }
  | { type: "SET_TOOL"; tool: Tool }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESTORE_SNAPSHOT"; snapshot: Pick<CanvasState, "elements" | "selectedIds"> };

export type ShapeType = "rectangle" | "circle";

export interface CanvasElement {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface Viewport {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export type Tool = "select" | "pan";

export interface CanvasState {
  elements: CanvasElement[];
  selectedIds: string[];
  viewport: Viewport;
  tool: Tool;
}

export type CanvasAction =
  | { type: "ADD_ELEMENT"; element: CanvasElement }
  | { type: "UPDATE_ELEMENT"; id: string; changes: Partial<CanvasElement> }
  | { type: "DELETE_ELEMENT"; id: string }
  | { type: "SET_SELECTION"; ids: string[] }
  | { type: "CLEAR_SELECTION" }
  | { type: "SET_VIEWPORT"; viewport: Partial<Viewport> }
  | { type: "SET_TOOL"; tool: Tool };

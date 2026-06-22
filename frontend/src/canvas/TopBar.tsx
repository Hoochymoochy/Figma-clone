import { useCanvasContext } from "./store.tsx";

export default function TopBar() {
  const { state, undo, redo, canUndo, canRedo, dispatch } = useCanvasContext();
  const hasSelection = state.selectedIds.length > 0;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 border-b border-neutral-700 select-none">
      {/* Brand */}
      <span className="text-sm font-semibold text-neutral-200 tracking-wide mr-3">
        Figma Clone
      </span>

      {/* Divider */}
      <div className="w-px h-5 bg-neutral-600" />

      {/* Tools */}
      <button
        onClick={() => dispatch({ type: "SET_TOOL", tool: "select" })}
        className={`px-2 py-1 text-xs rounded transition-colors ${
          state.tool === "select"
            ? "bg-neutral-600 text-white"
            : "text-neutral-300 hover:bg-neutral-700"
        }`}
        title="Select (V)"
      >
        ↖ Select
      </button>
      <button
        onClick={() => dispatch({ type: "SET_TOOL", tool: "polygon" })}
        className={`px-2 py-1 text-xs rounded transition-colors ${
          state.tool === "polygon"
            ? "bg-neutral-600 text-white"
            : "text-neutral-300 hover:bg-neutral-700"
        }`}
        title="Polygon — click to place points, double-click or Enter to close"
      >
        ⬠ Polygon
      </button>
      <button
        onClick={() => dispatch({ type: "SET_TOOL", tool: "measure" })}
        className={`px-2 py-1 text-xs rounded transition-colors ${
          state.tool === "measure"
            ? "bg-neutral-600 text-white"
            : "text-neutral-300 hover:bg-neutral-700"
        }`}
        title="Measure — click point A, then point B (snaps to grid)"
      >
        📏 Measure
      </button>
      <button
        onClick={() => dispatch({ type: "SET_TOOL", tool: "annotate" })}
        className={`px-2 py-1 text-xs rounded transition-colors ${
          state.tool === "annotate"
            ? "bg-neutral-600 text-white"
            : "text-neutral-300 hover:bg-neutral-700"
        }`}
        title="Annotate — click a shape to add or edit its label"
      >
        🏷 Annotate
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-neutral-600" />

      {/* Undo / Redo */}
      <button
        onClick={undo}
        disabled={!canUndo}
        className="px-2 py-1 text-xs rounded text-neutral-300 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-default transition-colors"
        title="Undo (Ctrl+Z)"
      >
        ↩ Undo
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        className="px-2 py-1 text-xs rounded text-neutral-300 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-default transition-colors"
        title="Redo (Ctrl+Y)"
      >
        ↪ Redo
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-neutral-600" />

      {/* Delete selected */}
      <button
        onClick={() => dispatch({ type: "DELETE_SELECTED" })}
        disabled={!hasSelection}
        className="px-2 py-1 text-xs rounded text-neutral-300 hover:bg-red-800 hover:text-red-200 disabled:opacity-30 disabled:cursor-default transition-colors"
        title="Delete selected (Del)"
      >
        🗑 Delete
      </button>

      {/* Spacer */}
      <span className="flex-1" />

      {/* Help text */}
      <span className="text-xs text-neutral-500">
        {state.tool === "polygon"
          ? "Click to place points · Double-click or Enter to close · Esc to cancel"
          : state.tool === "measure"
            ? "Click point A, then point B · Distances in grid units · Esc to cancel"
          : state.tool === "annotate"
            ? "Click a shape to label it · Edit in the sidebar · Esc to deselect"
          : hasSelection
            ? `${state.selectedIds.length} selected`
            : "Space+drag to pan · Scroll to zoom"}
      </span>
    </div>
  );
}

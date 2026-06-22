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
        {hasSelection
          ? `${state.selectedIds.length} selected`
          : "Space+drag to pan · Scroll to zoom"}
      </span>
    </div>
  );
}

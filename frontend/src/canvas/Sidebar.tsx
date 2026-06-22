import { useRef, useEffect } from "react";
import { useCanvasContext } from "./store.tsx";

export default function Sidebar() {
  const { state, dispatch } = useCanvasContext();
  const inputRef = useRef<HTMLInputElement>(null);

  const selected =
    state.selectedIds.length > 0
      ? state.elements.find((el) => el.id === state.selectedIds[0])
      : undefined;

  const labeledCount = state.elements.filter((el) => el.label?.trim()).length;

  useEffect(() => {
    if (selected && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [selected?.id]);

  return (
    <aside className="w-64 shrink-0 flex flex-col bg-neutral-800 border-r border-neutral-700 select-none">
      <div className="px-3 py-2 border-b border-neutral-700">
        <h2 className="text-xs font-semibold text-neutral-200 tracking-wide">
          Annotations
        </h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          {labeledCount} labeled shape{labeledCount !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {selected ? (
          <div className="space-y-3">
            <div>
              <span className="text-xs text-neutral-500 uppercase tracking-wide">
                Shape
              </span>
              <p className="text-sm text-neutral-200 mt-0.5 capitalize">
                {selected.type}
              </p>
            </div>

            <div>
              <label
                htmlFor="annotation-label"
                className="text-xs text-neutral-500 uppercase tracking-wide"
              >
                Label
              </label>
              <input
                ref={inputRef}
                id="annotation-label"
                type="text"
                value={selected.label ?? ""}
                placeholder="Enter a label…"
                onChange={(e) =>
                  dispatch({
                    type: "UPDATE_ELEMENT",
                    id: selected.id,
                    changes: { label: e.target.value },
                  })
                }
                className="mt-1 w-full px-2 py-1.5 text-sm bg-neutral-900 border border-neutral-600 rounded text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            {selected.label && (
              <button
                onClick={() =>
                  dispatch({
                    type: "UPDATE_ELEMENT",
                    id: selected.id,
                    changes: { label: "" },
                  })
                }
                className="text-xs text-neutral-400 hover:text-red-400 transition-colors"
              >
                Clear label
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-neutral-500 leading-relaxed">
            Click a shape on the canvas to add or edit its label.
          </p>
        )}

        {state.elements.length > 0 && (
          <div className="mt-6">
            <span className="text-xs text-neutral-500 uppercase tracking-wide">
              All shapes
            </span>
            <ul className="mt-2 space-y-1">
              {state.elements.map((el) => {
                const isActive = el.id === state.selectedIds[0];
                return (
                  <li key={el.id}>
                    <button
                      onClick={() =>
                        dispatch({ type: "SET_SELECTION", ids: [el.id] })
                      }
                      className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                        isActive
                          ? "bg-neutral-700 text-neutral-100"
                          : "text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
                      }`}
                    >
                      <span className="capitalize">{el.type}</span>
                      {el.label ? (
                        <span className="text-neutral-500 ml-1.5">
                          — {el.label}
                        </span>
                      ) : (
                        <span className="text-neutral-600 ml-1.5 italic">
                          — unlabeled
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}

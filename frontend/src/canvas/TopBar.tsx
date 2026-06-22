export default function TopBar() {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-neutral-800 border-b border-neutral-700 select-none">
      <span className="text-sm font-semibold text-neutral-200 tracking-wide">
        Figma Clone
      </span>
      <span className="text-xs text-neutral-500">
        Space+drag to pan · Scroll to zoom
      </span>
    </div>
  );
}

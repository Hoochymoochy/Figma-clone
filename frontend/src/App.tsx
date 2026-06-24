import { useEffect } from "react";
import { CanvasProvider, useCanvasContext } from "./canvas/store.tsx";
import Canvas from "./canvas/Canvas.tsx";
import TopBar from "./canvas/TopBar.tsx";
import Sidebar from "./canvas/Sidebar.tsx";
import MouseTracker from "./canvas/MouseTracker.tsx";
import { initGeometry } from "./geometry/scene.ts";

function AppLayout() {
  const { state } = useCanvasContext();

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-900 text-white">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        {state.tool === "annotate" && <Sidebar />}
        <Canvas />
      </div>
      <MouseTracker />
    </div>
  );
}

function App() {
  useEffect(() => {
    initGeometry().catch((err) => {
      console.error("Failed to initialize geometry WASM:", err);
    });
  }, []);

  return (
    <CanvasProvider>
      <AppLayout />
    </CanvasProvider>
  );
}

export default App;

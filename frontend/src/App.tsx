import { CanvasProvider } from "./canvas/store.tsx";
import Canvas from "./canvas/Canvas.tsx";
import TopBar from "./canvas/TopBar.tsx";
import MouseTracker from "./canvas/MouseTracker.tsx";

function App() {
  return (
    <CanvasProvider>
      <div className="h-screen w-screen flex flex-col bg-neutral-900 text-white">
        <TopBar />
        <Canvas />
        <MouseTracker />
      </div>
    </CanvasProvider>
  );
}

export default App;

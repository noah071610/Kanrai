import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import { App } from "./App.js";
import "./styles.css";

// shadcn tokens switch on `.dark`; follow the OS setting.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const syncTheme = () => document.documentElement.classList.toggle("dark", dark.matches);
syncTheme();
dark.addEventListener("change", syncTheme);

if (window.frameElement?.id === "viewer-viewport") {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App navigationWindow={window.parent} />
    </StrictMode>,
  );
} else {
  // 프레임 내부 좌표계를 유지해야 React Flow의 드래그·리사이즈·연결선이 함께 맞는다.
  const frame = document.createElement("iframe");
  frame.id = "viewer-viewport";
  frame.title = "API flow viewer";
  const url = new URL(window.location.href);
  url.searchParams.set("viewport", "1");
  frame.src = url.href;

  const syncViewport = () => {
    // 1440px 논리 폭을 화면에 맞춘다. Chrome 줌에 따른 innerWidth 변화도 상쇄된다.
    const scale = window.innerWidth / 1440;
    frame.style.width = "1440px";
    frame.style.height = `${window.innerHeight / scale}px`;
    frame.style.transform = `scale(${scale})`;
  };
  syncViewport();
  window.addEventListener("resize", syncViewport);
  document.getElementById("root")!.append(frame);
}

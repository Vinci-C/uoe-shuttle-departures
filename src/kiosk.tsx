import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import KioskView from "./KioskView.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <KioskView />
  </StrictMode>,
);

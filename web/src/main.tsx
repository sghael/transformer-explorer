import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import LoadBoundary from "./LoadBoundary";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LoadBoundary scope="exhibit">
      <App />
    </LoadBoundary>
  </React.StrictMode>,
);

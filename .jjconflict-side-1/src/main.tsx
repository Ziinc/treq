import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@xterm/xterm/css/xterm.css";
import { initLogger } from "./lib/logger";

// Initialize logging (console forwarding + attach to receive Rust logs)
initLogger();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

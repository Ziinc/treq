import "@xterm/xterm/css/xterm.css";
import { initLogger } from "./lib/logger";
import App from "./App";
import React from "react";
import ReactDOM from "react-dom/client";

// Initialize logging (console forwarding + attach to receive Rust logs)
initLogger();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

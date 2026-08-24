import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import "./styles.css";
import App from "./app.tsx";

// TEMPLATE-MANAGED (__ prefix) — do not edit.
// Mounts the app. Add global providers in components/provider.tsx and
// routes in app.tsx; both stay editable.

// A packaged Electron renderer starts at file://.../index.html, whose path is
// not "/". Hash routing makes the initial page and all sidebar links resolve
// correctly without changing normal browser development routing.
const routerHook = window.location.protocol === "file:" ? useHashLocation : undefined;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router hook={routerHook}>
      <App />
    </Router>
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthGate } from "./features/auth/AuthGate";
import { applyCachedPreferences } from "./lib/preferences";
import "./styles.css";

// MEL-30: last known theme/accent/density/motion/privacy on <html> before the first paint (no flash).
applyCachedPreferences();

createRoot(document.getElementById("root")!).render(<StrictMode><AuthGate><App /></AuthGate></StrictMode>);

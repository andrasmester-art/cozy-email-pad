import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initTheme } from "./lib/theme";
import { installDebugLog } from "./lib/debugLog";

// Téma alkalmazása MIELŐTT a React felépítené a fát — így nem villan be
// a világos háttér, mielőtt a sötét mód ráülne.
initTheme();
// Renderer console-ring puffer telepítése (a Sidebar „Hibanapló mentése"
// gombjához gyűjti a [loadMessages]/[cache.*]/[syncMailbox]/[ipc cache:…] sorokat).
installDebugLog();

createRoot(document.getElementById("root")!).render(<App />);

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initTheme } from "./lib/theme";

// Téma alkalmazása MIELŐTT a React felépítené a fát — így nem villan be
// a világos háttér, mielőtt a sötét mód ráülne.
initTheme();

createRoot(document.getElementById("root")!).render(<App />);

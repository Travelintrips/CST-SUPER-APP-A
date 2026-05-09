import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

(window as any).__BASE_PATH__ = import.meta.env.BASE_URL || "/bizportal/";

createRoot(document.getElementById("root")!).render(<App />);

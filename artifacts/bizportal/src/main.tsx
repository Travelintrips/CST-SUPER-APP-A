import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

(window as any).__BASE_PATH__ = import.meta.env.BASE_URL || "/bizportal/";

// If Supabase OAuth redirected to /bizportal/ with customer portal tokens, forward to root.
// This happens because Supabase only has /bizportal/ whitelisted as a redirect URL.
if (typeof window !== "undefined") {
  const hash = window.location.hash;
  const params = new URLSearchParams(window.location.search);
  if (
    (hash && hash.includes("access_token=") && hash.includes("token_type=bearer")) ||
    params.get("portal") === "customer"
  ) {
    window.location.replace(window.location.origin + "/" + hash);
  }
}

createRoot(document.getElementById("root")!).render(<App />);

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

(window as any).__BASE_PATH__ = import.meta.env.BASE_URL || "/bizportal/";

// Only forward to customer portal root when OAuth was explicitly initiated by
// the Customer Portal (signalled via ?portal=customer query param).
// Do NOT match on the hash alone — BizPortal uses its own Supabase OAuth and
// those tokens must stay here.
if (typeof window !== "undefined") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("portal") === "customer") {
    window.location.replace(window.location.origin + "/customer-portal/" + window.location.hash);
  }
}

createRoot(document.getElementById("root")!).render(<App />);

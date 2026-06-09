import { Copy } from "lucide-react";
import Layout from "../components/Layout";
import { toast } from "sonner";

function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  function copy() {
    navigator.clipboard.writeText(code).then(() => toast.success("Copied!"));
  }
  return (
    <div className="relative bg-[#0a0e17] border border-white/10 rounded-lg p-4 font-mono text-xs text-slate-300 overflow-x-auto">
      <button
        onClick={copy}
        className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors"
      >
        <Copy className="w-4 h-4" />
      </button>
      <pre className="whitespace-pre-wrap break-all pr-6">{code}</pre>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-white mb-4 pb-2 border-b border-white/5">{title}</h2>
      {children}
    </section>
  );
}

const BASE = typeof window !== "undefined" ? window.location.origin : "";

export default function DocsPage() {
  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">API Documentation</h1>
        <p className="text-slate-400 text-sm mt-1">REST API reference for WA Gateway</p>
      </div>

      <div className="max-w-3xl space-y-0">
        <Section title="Authentication">
          <p className="text-slate-400 text-sm mb-3">
            All API requests require a Bearer token (API key). Generate one from the API Keys page.
          </p>
          <CodeBlock code={`Authorization: Bearer wag_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`} />
        </Section>

        <Section title="Send Message">
          <p className="text-slate-400 text-sm mb-3">
            Send a text message to a WhatsApp number.
          </p>
          <CodeBlock code={`POST ${BASE}/wa-gateway/api/messages/send
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY

{
  "device_id": 1,
  "to": "628123456789",
  "message": "Hello from WA Gateway!"
}`} />
          <p className="text-slate-400 text-xs mt-3">Response:</p>
          <CodeBlock code={`{
  "ok": true,
  "messageId": "3EB0..."
}`} />
        </Section>

        <Section title="Get Messages">
          <p className="text-slate-400 text-sm mb-3">List sent and received messages.</p>
          <CodeBlock code={`GET ${BASE}/wa-gateway/api/messages?device_id=1&limit=50
Authorization: Bearer YOUR_API_KEY`} />
          <CodeBlock code={`{
  "messages": [
    {
      "id": 1,
      "deviceId": 1,
      "direction": "outbound",
      "toFrom": "628123456789",
      "messageType": "text",
      "content": "Hello!",
      "status": "sent",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ],
  "page": 1,
  "limit": 50
}`} />
        </Section>

        <Section title="List Devices">
          <CodeBlock code={`GET ${BASE}/wa-gateway/api/devices
Authorization: Bearer YOUR_API_KEY`} />
        </Section>

        <Section title="Webhook Events">
          <p className="text-slate-400 text-sm mb-3">
            When a device receives a message, WA Gateway sends a POST request to the webhook URL configured for that device.
          </p>
          <CodeBlock code={`// Incoming webhook payload
{
  "event": "message.received",
  "deviceId": 1,
  "from": "628123456789",
  "text": "Hello!",
  "messageId": "3EB0...",
  "timestamp": 1704067200000
}`} />
        </Section>

        <Section title="cURL Examples">
          <p className="text-slate-400 text-sm mb-2">Send a message:</p>
          <CodeBlock code={`curl -X POST ${BASE}/wa-gateway/api/messages/send \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"device_id":1,"to":"628123456789","message":"Test"}'`} />
        </Section>

        <Section title="Status Codes">
          <div className="bg-[#111827] border border-white/10 rounded-xl overflow-hidden">
            {[
              ["200", "Success"],
              ["201", "Created"],
              ["400", "Bad request / validation error"],
              ["401", "Authentication required"],
              ["404", "Not found"],
              ["409", "Conflict (e.g. email already exists)"],
              ["500", "Server error"],
            ].map(([code, desc]) => (
              <div key={code} className="flex items-center gap-4 px-4 py-2.5 border-b border-white/5 last:border-0 text-sm">
                <code className="text-emerald-400 font-mono w-12 shrink-0">{code}</code>
                <span className="text-slate-400">{desc}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </Layout>
  );
}

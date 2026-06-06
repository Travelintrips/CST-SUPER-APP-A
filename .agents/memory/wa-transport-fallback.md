---
name: WhatsApp transport — WATI fails silently on group IDs; must fall back to Fonnte
description: Why notification chains stop after the first message when WATI is configured
---

The WA egress router (`lib/waTransport.ts` `sendViaService`) prefers WATI whenever
WATI env is configured, else Fonnte. The trap: `sendWatiSession` (lib/wati.ts)
**returns `{ ok: false, error }` on failure — it does NOT throw**.

**Why this breaks chains:** WhatsApp **group IDs** (e.g. `…@g.us`) are not valid WATI
contacts → WATI responds `200 { result:false, info:"Invalid Contact" }` (also seen:
"target input invalid"). If the caller awaits `sendWatiSession` but ignores its
return value, the message is dropped silently with no error, so multi-step
notification flows (order → vendor blast → admin-group confirmation) appear to
"stop with no continuation" even though everything returns success.

**How to apply:** Any path sending WA must treat WATI as best-effort and fall back to
Fonnte on `!result.ok`. Admin-group sends in particular should go through Fonnte
(WATI cannot address groups). `sendToAdminGroup` already forces Fonnte; `sendViaService`
now inspects the WATI result and falls back to Fonnte when it fails. When debugging
"notif WA berhenti", grep api-server logs for `[wati] sendSessionMessage non-OK` and
`Invalid Contact`.

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Wifi, WifiOff, Loader2, RefreshCw, Send, Unplug } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Layout from "../components/Layout";
import { api, type Message } from "../lib/api";
import { toast } from "sonner";

export default function DevicePage({ id }: { id: number }) {
  const qc = useQueryClient();
  const [qr, setQr] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [sendTo, setSendTo] = useState("");
  const [sendMsg, setSendMsg] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);

  const { data: device, isLoading } = useQuery({
    queryKey: ["device", id],
    queryFn: () => api.devices.get(id),
    refetchInterval: 5000,
  });

  const { data: msgData } = useQuery({
    queryKey: ["messages", id],
    queryFn: () => api.messages.list({ device_id: id, limit: 50 }),
    refetchInterval: 5000,
  });

  const connectMut = useMutation({
    mutationFn: () => api.devices.connect(id),
    onSuccess: () => {
      toast.success("Connecting…");
      qc.invalidateQueries({ queryKey: ["device", id] });
      startSSE();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const disconnectMut = useMutation({
    mutationFn: () => api.devices.disconnect(id),
    onSuccess: () => {
      toast.success("Disconnected");
      setQr(null);
      setLiveStatus("disconnected");
      qc.invalidateQueries({ queryKey: ["device", id] });
      stopSSE();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sendMut = useMutation({
    mutationFn: () => api.messages.send({ device_id: id, to: sendTo, message: sendMsg }),
    onSuccess: () => {
      toast.success("Message sent");
      setSendMsg("");
      qc.invalidateQueries({ queryKey: ["messages", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function startSSE() {
    stopSSE();
    const token = localStorage.getItem("wag_token") ?? "";
    const es = new EventSource(
      `/wa-gateway/api/devices/${id}/qr?token=${encodeURIComponent(token)}`,
    );

    es.addEventListener("qr", (e) => {
      const data = JSON.parse(e.data);
      setQr(data.qr);
    });
    es.addEventListener("status", (e) => {
      const data = JSON.parse(e.data);
      setLiveStatus(data.status);
      if (data.status === "connected") {
        setQr(null);
        qc.invalidateQueries({ queryKey: ["device", id] });
        toast.success(`Connected! Number: +${data.phone ?? "?"}`);
      }
    });
    es.onerror = () => {};
    eventSourceRef.current = es;
  }

  function stopSSE() {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }

  useEffect(() => {
    if (device?.status === "connecting" || device?.status === "connected") {
      startSSE();
    }
    return stopSSE;
  }, [device?.status]);

  const status = liveStatus ?? device?.status ?? "disconnected";

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        </div>
      </Layout>
    );
  }

  if (!device) {
    return (
      <Layout>
        <p className="text-slate-400">Device not found.</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <Link href="/wa-gateway/">
          <a className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Devices
          </a>
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{device.name}</h1>
            <p className="text-slate-400 text-sm mt-1">
              {device.phoneNumber ? `+${device.phoneNumber}` : "Not connected yet"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {status === "connected" && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <Wifi className="w-3 h-3" /> Connected
              </span>
            )}
            {status === "connecting" && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                <Loader2 className="w-3 h-3 animate-spin" /> Connecting
              </span>
            )}
            {status === "disconnected" && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-500/15 text-slate-400 border border-slate-500/30">
                <WifiOff className="w-3 h-3" /> Disconnected
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* QR / Connect Panel */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Connection</h2>

          {status === "disconnected" && !qr && (
            <div className="text-center py-8">
              <WifiOff className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-sm mb-4">Device not connected. Click connect to get QR code.</p>
              <button
                onClick={() => connectMut.mutate()}
                disabled={connectMut.isPending}
                className="flex items-center gap-2 mx-auto bg-emerald-500 hover:bg-emerald-400 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {connectMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Connect
              </button>
            </div>
          )}

          {(status === "connecting" || qr) && !qr && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mx-auto mb-4" />
              <p className="text-slate-400 text-sm">Waiting for QR code…</p>
            </div>
          )}

          {qr && (
            <div className="text-center">
              <p className="text-slate-400 text-sm mb-4">Scan this QR with WhatsApp → Linked Devices → Link a Device</p>
              <div className="bg-white rounded-xl p-4 inline-block">
                <QRCodeSVG value={qr} size={200} />
              </div>
              <p className="text-xs text-slate-500 mt-3">QR refreshes automatically</p>
            </div>
          )}

          {status === "connected" && (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                <Wifi className="w-8 h-8 text-emerald-400" />
              </div>
              <p className="text-white font-medium">Connected</p>
              <p className="text-slate-400 text-sm mt-1">+{device.phoneNumber}</p>
              <button
                onClick={() => disconnectMut.mutate()}
                disabled={disconnectMut.isPending}
                className="mt-4 flex items-center gap-2 mx-auto bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {disconnectMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />}
                Disconnect
              </button>
            </div>
          )}
        </div>

        {/* Send Message */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Send Message</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">To (phone number)</label>
              <input
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                disabled={status !== "connected"}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                placeholder="628123456789"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Message</label>
              <textarea
                value={sendMsg}
                onChange={(e) => setSendMsg(e.target.value)}
                disabled={status !== "connected"}
                rows={4}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                placeholder="Type your message…"
              />
            </div>
            <button
              onClick={() => sendMut.mutate()}
              disabled={status !== "connected" || !sendTo || !sendMsg || sendMut.isPending}
              className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
            >
              {sendMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </button>
          </div>
        </div>

        {/* Message Log */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 lg:col-span-2">
          <h2 className="text-sm font-semibold text-white mb-4">Message Log</h2>
          {!msgData?.messages.length ? (
            <p className="text-slate-500 text-sm text-center py-8">No messages yet</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {msgData.messages.map((m: Message) => (
                <div key={m.id} className={`flex gap-3 p-3 rounded-lg text-sm ${m.direction === "inbound" ? "bg-white/5" : "bg-emerald-500/5"}`}>
                  <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${m.direction === "inbound" ? "bg-blue-500/15 text-blue-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                    {m.direction === "inbound" ? "IN" : "OUT"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-slate-300 font-medium">{m.toFrom}</span>
                      <span className="text-slate-600 text-xs">{new Date(m.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-slate-400 truncate">{m.content}</p>
                  </div>
                  <span className={`shrink-0 text-xs ${m.status === "sent" || m.status === "received" ? "text-emerald-400" : "text-slate-500"}`}>
                    {m.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

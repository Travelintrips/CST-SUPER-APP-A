import net from "net";
const LISTEN_PORT = 18444;
const TARGET_PORT = 8080;
const server = net.createServer((src) => {
  const dst = net.connect(TARGET_PORT, "127.0.0.1");
  src.pipe(dst);
  dst.pipe(src);
  src.on("error", () => dst.destroy());
  dst.on("error", () => src.destroy());
});
server.listen(LISTEN_PORT, "0.0.0.0", () => {
  process.stdout.write(`[port-forwarder] ${LISTEN_PORT} -> ${TARGET_PORT}\n`);
});
server.on("error", (err) => {
  process.stderr.write(`[port-forwarder] error: ${err.message}\n`);
});

import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { waAccounts } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken } from "../middleware/auth.js";

const router = Router();

router.post("/register", async (req, res) => {
  const { email, password, name } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password min 6 characters" });
    return;
  }

  const existing = await db.select({ id: waAccounts.id }).from(waAccounts).where(eq(waAccounts.email, email));
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [account] = await db.insert(waAccounts).values({ email, passwordHash, name: name ?? null }).returning();

  const token = signToken({ accountId: account.id, email: account.email });
  res.json({ token, account: { id: account.id, email: account.email, name: account.name } });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  const [account] = await db.select().from(waAccounts).where(eq(waAccounts.email, email));
  if (!account) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = signToken({ accountId: account.id, email: account.email });
  res.json({ token, account: { id: account.id, email: account.email, name: account.name } });
});

router.get("/me", async (req, res) => {
  const header = req.headers.authorization ?? "";
  const raw = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!raw) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const jwt = await import("jsonwebtoken");
    const secret = process.env.WA_GATEWAY_JWT_SECRET ?? "wa-gateway-secret-change-in-prod";
    const payload = jwt.default.verify(raw, secret) as any;
    const [account] = await db.select({ id: waAccounts.id, email: waAccounts.email, name: waAccounts.name })
      .from(waAccounts).where(eq(waAccounts.id, payload.accountId));
    if (!account) { res.status(404).json({ error: "Account not found" }); return; }
    res.json(account);
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;

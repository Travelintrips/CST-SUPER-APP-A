import { Router, type IRouter, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_PREFIXES = ["image/", "application/pdf"];

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return createClient(url, key);
}

function getBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET ?? "bizportal";
}

/**
 * POST /storage/uploads/request-url
 *
 * Returns an internal upload token. The client will PUT the file to /api/storage/upload/:objectId
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    if (typeof size === "number" && size > MAX_UPLOAD_BYTES) {
      res.status(413).json({ error: "File too large (max 10MB)" });
      return;
    }
    if (
      typeof contentType === "string" &&
      contentType.length > 0 &&
      !ALLOWED_UPLOAD_PREFIXES.some((p) => contentType.toLowerCase().startsWith(p))
    ) {
      res.status(415).json({ error: "Unsupported file type" });
      return;
    }

    const objectId = randomUUID();
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
    const uploadURL = `${proto}://${host}/api/storage/upload/${objectId}`;
    const objectPath = `/objects/uploads/${objectId}`;

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * PUT /storage/upload/:objectId
 *
 * Receives file body and stores in Supabase Storage (private/uploads/).
 */
router.put("/storage/upload/:objectId", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const objectId = String(req.params.objectId);
  if (!objectId) {
    res.status(400).json({ error: "Missing objectId" });
    return;
  }

  try {
    const supabase = getSupabase();
    const bucket = getBucket();
    const storagePath = `private/uploads/${objectId}`;
    const contentType = req.headers["content-type"] || "application/octet-stream";

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length > MAX_UPLOAD_BYTES) {
      res.status(413).json({ error: "File too large (max 10MB)" });
      return;
    }

    const { error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, { contentType, upsert: true });

    if (error) {
      req.log.error({ err: error }, "Supabase Storage upload failed");
      res.status(500).json({ error: "Upload failed" });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    req.log.error({ err: error }, "Error during file upload");
    res.status(500).json({ error: "Upload failed" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from Supabase Storage public/ folder.
 */
router.get("/storage/public-objects/{*filePath}", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const supabase = getSupabase();
    const bucket = getBucket();
    const storagePath = `public/${filePath}`;

    const { data, error } = await supabase.storage.from(bucket).download(storagePath);
    if (error || !data) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    res.setHeader("Content-Type", data.type || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve private object entities from Supabase Storage private/ folder.
 */
router.get("/storage/objects/{*path}", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    const supabase = getSupabase();
    const bucket = getBucket();
    const entityId = objectPath.slice("/objects/".length);
    const storagePath = `private/${entityId}`;

    const { data, error } = await supabase.storage.from(bucket).download(storagePath);
    if (error || !data) {
      res.status(404).json({ error: "Object not found" });
      return;
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    res.setHeader("Content-Type", data.type || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;

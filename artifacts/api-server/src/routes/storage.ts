import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { createClient } from "@supabase/supabase-js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_PREFIXES = ["image/", "application/pdf"];

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  return createClient(url, key);
}

function getBucket(): string {
  const b = process.env.SUPABASE_STORAGE_BUCKET;
  if (!b) throw new Error("SUPABASE_STORAGE_BUCKET must be set");
  return b;
}

/**
 * POST /storage/uploads/request-url
 *
 * Returns a Supabase signed upload URL. Client uploads directly via PUT.
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

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

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
 * GET /storage/public-objects/*
 *
 * Serve public assets — proxies from Supabase Storage public folder.
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

    const contentType = data.type || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Content-Length", String(data.size));

    const nodeStream = Readable.fromWeb(data.stream() as ReadableStream<Uint8Array>);
    nodeStream.pipe(res);
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve private object entities from Supabase Storage private folder.
 */
router.get("/storage/objects/{*path}", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const supabase = getSupabase();

    const { data, error } = await supabase.storage
      .from(objectFile.bucket)
      .download(objectFile.path);

    if (error || !data) {
      res.status(404).json({ error: "Object not found" });
      return;
    }

    const contentType = data.type || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Content-Length", String(data.size));

    const nodeStream = Readable.fromWeb(data.stream() as ReadableStream<Uint8Array>);
    nodeStream.pipe(res);
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

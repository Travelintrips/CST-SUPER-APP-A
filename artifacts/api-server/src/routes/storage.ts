import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { Client } from "@replit/object-storage";
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

function getClient() {
  return new Client();
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
    const storagePath = `private/uploads/${objectId}`;
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
 * Receives file body and stores in Replit Object Storage.
 */
router.put("/storage/upload/:objectId", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { objectId } = req.params;
  if (!objectId) {
    res.status(400).json({ error: "Missing objectId" });
    return;
  }

  try {
    const client = getClient();
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

    const result = await client.uploadFromBytes(storagePath, buffer, { contentType });
    if (!result.ok) {
      req.log.error({ err: result.error }, "Replit Object Storage upload failed");
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
 * Serve public assets from Replit Object Storage public folder.
 */
router.get("/storage/public-objects/{*filePath}", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const client = getClient();
    const storagePath = `public/${filePath}`;

    const result = await client.downloadAsBytes(storagePath);
    if (!result.ok || !result.value) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Content-Length", String(result.value.length));
    res.end(Buffer.from(result.value));
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve private object entities from Replit Object Storage private folder.
 */
router.get("/storage/objects/{*path}", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    const client = getClient();
    const entityId = objectPath.slice("/objects/".length);
    const storagePath = `private/${entityId}`;

    const result = await client.downloadAsBytes(storagePath);
    if (!result.ok || !result.value) {
      res.status(404).json({ error: "Object not found" });
      return;
    }

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Content-Length", String(result.value.length));
    res.end(Buffer.from(result.value));
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

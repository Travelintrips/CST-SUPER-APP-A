import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import multer from "multer";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { ObjectPermission, getObjectAclPolicy } from "../lib/objectAcl.js";
import { requireAdmin } from "../lib/requireAdmin.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/**
 * POST /storage/uploads/file
 *
 * Server-side file upload via multipart form.
 * Accepts a single file field named "file" and saves it to private object storage.
 * Sets ACL metadata recording the uploader as the owner so that the download
 * endpoint can enforce owner-based access without requiring admin rights.
 * Returns { objectPath, url } where url = /api/storage/objects/...
 */
router.post("/storage/uploads/file", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  try {
    const objectPath = await objectStorageService.uploadPrivateEntity(req.file.buffer, req.file.mimetype);

    // Stamp ownership on the object immediately so downloads can enforce access
    // without falling back to admin-only.  Errors here are non-fatal: the upload
    // already succeeded, and the download endpoint falls back to requireAdmin.
    try {
      await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
        owner: req.user.id,
        visibility: "private",
      });
    } catch (aclErr) {
      req.log.warn({ err: aclErr }, "Could not set ACL on uploaded object; admin-only fallback applies");
    }

    res.json({ objectPath, url: `/api/storage${objectPath}` });
  } catch (error) {
    req.log.error({ err: error }, "Error uploading file");
    res.status(500).json({ error: "Failed to upload file" });
  }
});

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned GCS URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Client then uploads the file directly to the returned presigned URL (GCS).
 *
 * Note: ACL metadata cannot be set at this point because the GCS object does
 * not yet exist.  Objects created through this flow will have no ACL metadata
 * at the time of upload; the business route that ultimately saves the objectPath
 * is responsible for calling trySetObjectEntityAclPolicy.  Until then the
 * download endpoint applies the admin-only fallback for these objects.
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
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * Unconditionally public — no auth checks.
 */
router.get("/storage/public-objects/{*filePath}", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve private object entities from PRIVATE_OBJECT_DIR.
 *
 * Authorization (three layers, evaluated in order):
 *
 * 1. Authentication gate — unauthenticated callers always receive 401.
 *    Private objects must never be downloadable without a valid session,
 *    regardless of whether the caller knows the path.
 *
 * 2. ACL enforcement for objects with metadata — when ACL metadata is present
 *    on the object (written by POST /storage/uploads/file or by a business
 *    route that calls trySetObjectEntityAclPolicy), access is granted only to
 *    the recorded owner or to a caller covered by an explicit ACL rule.  Any
 *    other authenticated caller receives 403.
 *
 * 3. Admin fallback for objects without metadata — objects that carry no ACL
 *    metadata (legacy uploads or presigned-URL uploads whose business route has
 *    not yet stamped ownership) are restricted to admin-role users.  This is
 *    the default-deny posture for unknown ownership: only a trusted admin may
 *    access a file whose provenance cannot be verified from metadata alone.
 *    As the upload paths progressively stamp ACL metadata, layer 2 will handle
 *    an increasing share of requests and the admin fallback will narrow.
 */
router.get("/storage/objects/{*path}", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const aclPolicy = await getObjectAclPolicy(objectFile);

    if (aclPolicy !== null) {
      // Object has ACL metadata — enforce owner / ACL-rule access.
      const userId = req.user.id;
      const aclAllowed = await objectStorageService.canAccessObjectEntity({
        userId,
        objectFile,
        requestedPermission: ObjectPermission.READ,
      });
      if (!aclAllowed) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    } else {
      // No ACL metadata (legacy or presigned-URL upload) — fall back to admin
      // rule.  requireAdmin sends 403 itself and returns false if denied.
      if (!(await requireAdmin(req, res))) return;
    }

    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
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

import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import multer from "multer";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { ObjectPermission } from "../lib/objectAcl.js";
import { requireAdmin, requireClerkUser } from "../lib/requireAdmin.js";

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
 * Authorization (two layers, evaluated in order):
 *
 * 1. Authentication gate — unauthenticated callers always receive 401.
 *    Private objects must never be downloadable without a valid session,
 *    regardless of whether the caller knows the path.
 *
 * 2. Owner / ACL / admin check —
 *    a) canAccessObjectEntity() is called first.  If the requesting user is
 *       the recorded owner of the object (set via ACL metadata at upload time)
 *       or is covered by an explicit ACL rule, access is granted immediately.
 *    b) If canAccessObjectEntity() returns false — either because the object
 *       has ACL metadata that does not cover this user, or because the object
 *       has no ACL metadata at all (legacy or presigned-URL uploads) — the
 *       caller must have admin role.  requireAdmin() handles the 403.  This
 *       ensures authorized admin/staff users are never locked out of
 *       business-critical documents regardless of who originally uploaded them.
 */
router.get("/storage/objects/{*path}", async (req: Request, res: Response) => {
  // Layer 1: authentication gate — unauthenticated callers always receive 401.
  if (!(await requireClerkUser(req, res))) return;

  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;

    // Reject path traversal attempts before they reach the storage layer.
    if (wildcardPath.split("/").some((segment) => segment === ".." || segment === ".")) {
      res.status(400).json({ error: "Invalid object path" });
      return;
    }

    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    // Layer 2: ownership / ACL check — confirm the authenticated user is
    // permitted to read this specific object.
    // canAccessObjectEntity() returns false both when ACL metadata is absent
    // (legacy / presigned-URL objects) and when metadata exists but does not
    // cover the requesting user.  In either case fall back to admin override so
    // that authorized staff are never locked out of business-critical documents.
    const userId = req.user?.id;
    const aclAllowed = await objectStorageService.canAccessObjectEntity({
      userId,
      objectFile,
      requestedPermission: ObjectPermission.READ,
    });

    if (!aclAllowed) {
      // Not the ACL-designated owner — require admin role.
      // requireAdmin() sends its own 403 and returns false if denied.
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

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return createClient(url, key);
}

function getBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET ?? "bizportal";
}

export class ObjectStorageService {
  getPublicObjectSearchPaths(): string[] {
    return ["public"];
  }

  getPrivateObjectDir(): string {
    return "private";
  }

  async searchPublicObject(filePath: string): Promise<{ bucket: string; path: string } | null> {
    const supabase = getSupabase();
    const bucket = getBucket();
    const objectPath = `public/${filePath}`;
    const { data, error } = await supabase.storage.from(bucket).list(
      objectPath.substring(0, objectPath.lastIndexOf("/")),
      { search: objectPath.substring(objectPath.lastIndexOf("/") + 1) },
    );
    if (error || !data || data.length === 0) return null;
    return { bucket, path: objectPath };
  }

  async downloadObject(
    obj: { bucket: string; path: string },
    cacheTtlSec: number = 3600,
  ): Promise<Response> {
    const supabase = getSupabase();
    const { data, error } = await supabase.storage.from(obj.bucket).download(obj.path);
    if (error || !data) throw new ObjectNotFoundError();
    const buffer = Buffer.from(await data.arrayBuffer());
    const isPublic = obj.path.startsWith("public/");
    return new Response(buffer, {
      headers: {
        "Content-Type": data.type || "application/octet-stream",
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
        "Content-Length": String(buffer.length),
      },
    });
  }

  /**
   * Generate an internal upload URL for private file storage.
   * @param folder One of: documents, customer-attachments, ocr-temp
   */
  async getObjectEntityUploadURL(folder: "documents" | "customer-attachments" | "ocr-temp" = "documents"): Promise<string> {
    const objectId = randomUUID();
    return `/api/storage/internal-upload/private/${folder}/${objectId}`;
  }

  /**
   * Generate an internal upload URL for public asset storage (portal CMS images).
   * Stored under public/public-assets/ — accessible without auth.
   */
  async getPublicAssetUploadURL(): Promise<string> {
    const objectId = randomUUID();
    return `/api/storage/internal-upload/public/public-assets/${objectId}`;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (typeof rawPath !== "string" || rawPath.length === 0) {
      throw new Error("Invalid object path");
    }
    if (rawPath.startsWith("/objects/")) {
      return rawPath;
    }
    if (rawPath.startsWith("/api/storage/internal-upload/private/")) {
      const entityId = rawPath.replace("/api/storage/internal-upload/private/", "");
      return `/objects/${entityId}`;
    }
    if (rawPath.startsWith("/api/storage/internal-upload/public/")) {
      const filePath = rawPath.replace("/api/storage/internal-upload/public/", "");
      return `/api/storage/public-objects/${filePath}`;
    }
    throw new Error("Invalid object path: must be /objects/* or an internal upload path");
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    _aclPolicy: { owner: string; visibility: "public" | "private" },
  ): Promise<string> {
    return this.normalizeObjectEntityPath(rawPath);
  }

  async canAccessObjectEntity({
    objectFile,
  }: {
    userId?: string;
    objectFile: { bucket: string; path: string };
    requestedPermission?: string;
  }): Promise<boolean> {
    return objectFile.path.startsWith("public/");
  }

  async getObjectEntityFile(objectPath: string): Promise<{ bucket: string; path: string }> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const supabase = getSupabase();
    const bucket = getBucket();
    const entityId = objectPath.slice("/objects/".length);
    const storagePath = `private/${entityId}`;
    const { data, error } = await supabase.storage.from(bucket).list(
      storagePath.substring(0, storagePath.lastIndexOf("/")),
      { search: storagePath.substring(storagePath.lastIndexOf("/") + 1) },
    );
    if (error || !data || data.length === 0) throw new ObjectNotFoundError();
    return { bucket, path: storagePath };
  }

  async uploadFile(
    buffer: Buffer,
    storagePath: string,
    contentType: string,
  ): Promise<string> {
    const supabase = getSupabase();
    const bucket = getBucket();
    const { error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, { contentType, upsert: true });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return storagePath;
  }

  async getPublicUrl(storagePath: string): Promise<string> {
    return `/api/storage/public-objects/${storagePath.replace(/^public\//, "")}`;
  }

  async getSignedDownloadUrl(storagePath: string, _expiresInSec = 3600): Promise<string> {
    return `/api/storage/objects/${storagePath.replace(/^private\//, "")}`;
  }
}

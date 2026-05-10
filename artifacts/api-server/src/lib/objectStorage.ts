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
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  return createClient(url, key);
}

function getBucket(): string {
  const b = process.env.SUPABASE_STORAGE_BUCKET;
  if (!b) throw new Error("SUPABASE_STORAGE_BUCKET must be set");
  return b;
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
      { search: objectPath.substring(objectPath.lastIndexOf("/") + 1) }
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
    const contentType = data.type || "application/octet-stream";
    const isPublic = obj.path.startsWith("public/");
    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
        "Content-Length": String(data.size),
      },
    });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const supabase = getSupabase();
    const bucket = getBucket();
    const objectId = randomUUID();
    const objectPath = `private/uploads/${objectId}`;
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(objectPath);
    if (error || !data) throw new Error(`Failed to create signed upload URL: ${error?.message}`);
    return data.signedUrl;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (typeof rawPath !== "string" || rawPath.length === 0) {
      throw new Error("Invalid object path");
    }
    if (rawPath.startsWith("/objects/")) {
      return rawPath;
    }
    try {
      const url = new URL(rawPath);
      const supabaseUrl = process.env.SUPABASE_URL ?? "";
      const bucket = getBucket();
      const prefix = `/storage/v1/object/`;
      if (!url.href.startsWith(supabaseUrl) && !url.pathname.startsWith(prefix)) {
        throw new Error("Invalid object path: not a Supabase Storage URL");
      }
      const tokenParam = url.searchParams.get("token");
      if (tokenParam) {
        const pathMatch = url.pathname.match(
          new RegExp(`/storage/v1/object/upload/sign/${bucket}/(.+)`)
        );
        if (pathMatch?.[1]) {
          const entityId = pathMatch[1].replace(/^private\/uploads\//, "");
          return `/objects/uploads/${entityId}`;
        }
      }
      const pathMatch = url.pathname.match(
        new RegExp(`/storage/v1/object/(?:sign|public)/${bucket}/(.+)`)
      );
      if (!pathMatch?.[1]) {
        throw new Error("Invalid object path: cannot extract entity id from Supabase URL");
      }
      const storagePath = decodeURIComponent(pathMatch[1]);
      const entityId = storagePath.replace(/^private\//, "");
      return `/objects/${entityId}`;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Invalid object path")) throw e;
      throw new Error("Invalid object path: must be /objects/* or a Supabase Storage URL");
    }
  }

  async getObjectEntityFile(objectPath: string): Promise<{ bucket: string; path: string }> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const supabase = getSupabase();
    const bucket = getBucket();
    const entityId = objectPath.slice("/objects/".length);
    const storagePath = `private/${entityId}`;
    const { data, error } = await supabase.storage.from(bucket).list(
      storagePath.substring(0, storagePath.lastIndexOf("/")),
      { search: storagePath.substring(storagePath.lastIndexOf("/") + 1) }
    );
    if (error || !data || data.length === 0) throw new ObjectNotFoundError();
    return { bucket, path: storagePath };
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
    const supabase = getSupabase();
    const bucket = getBucket();
    const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    return data.publicUrl;
  }

  async getSignedDownloadUrl(storagePath: string, expiresInSec = 3600): Promise<string> {
    const supabase = getSupabase();
    const bucket = getBucket();
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, expiresInSec);
    if (error || !data) throw new Error(`Failed to create signed URL: ${error?.message}`);
    return data.signedUrl;
  }
}

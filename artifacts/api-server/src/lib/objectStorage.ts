import { Client } from "@replit/object-storage";
import { randomUUID } from "crypto";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

function getClient() {
  return new Client();
}

export class ObjectStorageService {
  getPublicObjectSearchPaths(): string[] {
    return ["public"];
  }

  getPrivateObjectDir(): string {
    return "private";
  }

  async searchPublicObject(filePath: string): Promise<{ bucket: string; path: string } | null> {
    const client = getClient();
    const objectPath = `public/${filePath}`;
    const result = await client.exists(objectPath);
    if (!result.ok || !result.value) return null;
    return { bucket: "default", path: objectPath };
  }

  async downloadObject(
    obj: { bucket: string; path: string },
    cacheTtlSec: number = 3600,
  ): Promise<Response> {
    const client = getClient();
    const result = await client.downloadAsBytes(obj.path);
    if (!result.ok || !result.value) throw new ObjectNotFoundError();
    const bytes = result.value;
    const isPublic = obj.path.startsWith("public/");
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
        "Content-Length": String(bytes.length),
      },
    });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    const objectPath = `private/uploads/${objectId}`;
    return `/api/storage/internal-upload/${objectPath}`;
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
    const client = getClient();
    const entityId = objectPath.slice("/objects/".length);
    const storagePath = `private/${entityId}`;
    const result = await client.exists(storagePath);
    if (!result.ok || !result.value) throw new ObjectNotFoundError();
    return { bucket: "default", path: storagePath };
  }

  async uploadFile(
    buffer: Buffer,
    storagePath: string,
    contentType: string,
  ): Promise<string> {
    const client = getClient();
    const result = await client.uploadFromBytes(storagePath, buffer, {
      contentType,
    });
    if (!result.ok) throw new Error(`Upload failed: ${result.error?.message}`);
    return storagePath;
  }

  async getPublicUrl(storagePath: string): Promise<string> {
    return `/api/storage/public-objects/${storagePath.replace(/^public\//, "")}`;
  }

  async getSignedDownloadUrl(storagePath: string, _expiresInSec = 3600): Promise<string> {
    return `/api/storage/objects/${storagePath.replace(/^private\//, "")}`;
  }
}

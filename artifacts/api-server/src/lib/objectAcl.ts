export enum ObjectAccessGroupType {}

export interface ObjectAccessGroup {
  type: ObjectAccessGroupType;
  id: string;
}

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
  aclRules?: Array<ObjectAclRule>;
}

export async function setObjectAclPolicy(
  _objectFile: { bucket: string; path: string },
  _aclPolicy: ObjectAclPolicy,
): Promise<void> {
  // Supabase Storage uses bucket-level public/private settings.
  // Row-level ACL is not stored per-object; access is controlled via signed URLs.
}

export async function getObjectAclPolicy(
  objectFile: { bucket: string; path: string },
): Promise<ObjectAclPolicy | null> {
  return {
    owner: "system",
    visibility: objectFile.path.startsWith("public/") ? "public" : "private",
  };
}

export async function canAccessObject({
  objectFile,
}: {
  userId?: string;
  objectFile: { bucket: string; path: string };
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  return objectFile.path.startsWith("public/");
}

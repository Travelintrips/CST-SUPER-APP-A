import { SignJWT, jwtVerify } from "jose";

const SECRET_RAW = process.env.PORTAL_JWT_SECRET ?? process.env.SESSION_SECRET;
if (!SECRET_RAW) {
  throw new Error(
    "Portal JWT secret not configured. " +
    "Set PORTAL_JWT_SECRET (or SESSION_SECRET as fallback) environment variable."
  );
}

const SECRET = new TextEncoder().encode(SECRET_RAW);
const ISSUER = "cst-portal";
const EXPIRY = "7d";

export interface PortalJwtPayload {
  sub: string;
  email: string;
  customerId: number;
  role: string;
}

export async function signPortalJwt(payload: PortalJwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(SECRET);
}

export async function verifyPortalJwt(token: string): Promise<PortalJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { issuer: ISSUER });
    if (
      typeof payload.email === "string" &&
      typeof payload.customerId === "number" &&
      typeof payload.role === "string"
    ) {
      return payload as unknown as PortalJwtPayload;
    }
    return null;
  } catch {
    return null;
  }
}

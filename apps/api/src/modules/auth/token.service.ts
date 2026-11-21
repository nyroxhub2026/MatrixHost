import {
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

function getSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("JWT_ACCESS_SECRET must contain at least 32 characters.");
  }

  return secret;
}

export interface AccessTokenPayload {
  sub: string;
  role: string;
  exp: number;
}

export function createAccessToken(
  userId: string,
  role: string,
  expiresInSeconds = 900
): string {
  const payload: AccessTokenPayload = {
    sub: userId,
    role,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const signature = createHmac("sha256", getSecret())
    .update(encoded)
    .digest("base64url");

  return `${encoded}.${signature}`;
}

export function verifyAccessToken(
  token: string
): AccessTokenPayload | null {
  try {
    const parts = token.split(".");

    if (parts.length !== 2) return null;

    const [encoded, suppliedSignature] = parts;

    if (!encoded || !suppliedSignature) return null;

    const expectedSignature = createHmac("sha256", getSecret())
      .update(encoded)
      .digest();

    const actualSignature = Buffer.from(suppliedSignature, "base64url");

    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as AccessTokenPayload;

    if (
      typeof payload.sub !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function createRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

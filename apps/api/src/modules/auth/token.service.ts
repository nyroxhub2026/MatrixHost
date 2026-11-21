import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const TOKEN_LIFETIME_SECONDS = 900;
const MAX_TOKEN_LIFETIME_SECONDS = 3600;
const MAX_TOKEN_LENGTH = 4096;

const ALLOWED_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "SUPPORT",
  "CUSTOMER",
] as const;

export type TokenRole =
  (typeof ALLOWED_ROLES)[number];

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  role: TokenRole;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;

  if (
    !secret ||
    Buffer.byteLength(secret, "utf8") < 32
  ) {
    throw new Error(
      "JWT_ACCESS_SECRET must contain at least 32 bytes."
    );
  }

  return secret;
}

function isTokenRole(
  value: unknown
): value is TokenRole {
  return (
    typeof value === "string" &&
    ALLOWED_ROLES.includes(value as TokenRole)
  );
}

function isBase64Url(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function sign(encodedPayload: string): Buffer {
  return createHmac("sha256", getSecret())
    .update(encodedPayload)
    .digest();
}

export function createAccessToken(
  userId: string,
  role: string,
  sessionId: string,
  expiresInSeconds = TOKEN_LIFETIME_SECONDS
): string {
  if (
    typeof userId !== "string" ||
    userId.length === 0 ||
    userId.length > 128 ||
    typeof sessionId !== "string" ||
    sessionId.length === 0 ||
    sessionId.length > 128 ||
    !isTokenRole(role)
  ) {
    throw new Error("Invalid access token payload.");
  }

  if (
    !Number.isInteger(expiresInSeconds) ||
    expiresInSeconds < 1 ||
    expiresInSeconds > MAX_TOKEN_LIFETIME_SECONDS
  ) {
    throw new Error("Invalid access token lifetime.");
  }

  const payload: AccessTokenPayload = {
    sub: userId,
    sid: sessionId,
    role,
    exp:
      Math.floor(Date.now() / 1000) +
      expiresInSeconds,
  };

  const encodedPayload = Buffer
    .from(JSON.stringify(payload), "utf8")
    .toString("base64url");

  const signature = sign(encodedPayload)
    .toString("base64url");

  return `${encodedPayload}.${signature}`;
}

export function verifyAccessToken(
  token: string
): AccessTokenPayload | null {
  try {
    if (
      typeof token !== "string" ||
      token.length === 0 ||
      token.length > MAX_TOKEN_LENGTH
    ) {
      return null;
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
      return null;
    }

    const [encodedPayload, suppliedSignature] = parts;

    if (
      !encodedPayload ||
      !suppliedSignature ||
      !isBase64Url(encodedPayload) ||
      !isBase64Url(suppliedSignature)
    ) {
      return null;
    }

    const expectedSignature = sign(encodedPayload);

    const actualSignature = Buffer.from(
      suppliedSignature,
      "base64url"
    );

    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(
        actualSignature,
        expectedSignature
      )
    ) {
      return null;
    }

    const decodedPayload = Buffer.from(
      encodedPayload,
      "base64url"
    ).toString("utf8");

    const payload: unknown = JSON.parse(
      decodedPayload
    );

    if (
      typeof payload !== "object" ||
      payload === null
    ) {
      return null;
    }

    const data = payload as Record<string, unknown>;

    if (
      typeof data.sub !== "string" ||
      data.sub.length === 0 ||
      data.sub.length > 128 ||
      typeof data.sid !== "string" ||
      data.sid.length === 0 ||
      data.sid.length > 128 ||
      !isTokenRole(data.role) ||
      typeof data.exp !== "number" ||
      !Number.isSafeInteger(data.exp) ||
      data.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return {
      sub: data.sub,
      sid: data.sid,
      role: data.role,
      exp: data.exp,
    };
  } catch {
    return null;
  }
}

export function createRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

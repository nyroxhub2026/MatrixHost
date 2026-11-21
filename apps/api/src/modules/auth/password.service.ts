import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

const SCRYPT_OPTIONS = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

const ALGORITHM = "scrypt";
const MAX_PASSWORD_LENGTH = 128;

export async function hashPassword(
  password: string
): Promise<string> {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new Error("Invalid password length.");
  }

  const salt = randomBytes(SALT_LENGTH).toString("hex");

  const derivedKey = (await scrypt(
    password,
    salt,
    KEY_LENGTH,
    SCRYPT_OPTIONS
  )) as Buffer;

  return [
    ALGORITHM,
    String(SCRYPT_OPTIONS.N),
    String(SCRYPT_OPTIONS.r),
    String(SCRYPT_OPTIONS.p),
    salt,
    derivedKey.toString("hex"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  try {
    if (
      typeof password !== "string" ||
      password.length === 0 ||
      password.length > MAX_PASSWORD_LENGTH ||
      typeof storedHash !== "string" ||
      storedHash.length > 512
    ) {
      return false;
    }

    const parts = storedHash.split("$");

    if (parts.length !== 6) {
      return false;
    }

    const [
      algorithm,
      cost,
      blockSize,
      parallelization,
      salt,
      expectedHex,
    ] = parts;

    if (
      algorithm !== ALGORITHM ||
      cost !== String(SCRYPT_OPTIONS.N) ||
      blockSize !== String(SCRYPT_OPTIONS.r) ||
      parallelization !== String(SCRYPT_OPTIONS.p) ||
      !/^[a-f0-9]{32}$/i.test(salt ?? "") ||
      !/^[a-f0-9]{128}$/i.test(expectedHex ?? "")
    ) {
      return false;
    }

    const expected = Buffer.from(
      expectedHex,
      "hex"
    );

    const actual = (await scrypt(
      password,
      salt,
      KEY_LENGTH,
      SCRYPT_OPTIONS
    )) as Buffer;

    if (actual.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(
      expected,
      actual
    );
  } catch {
    return false;
  }
}

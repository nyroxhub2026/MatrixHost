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

export async function hashPassword(
  password: string
): Promise<string> {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128
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
    "scrypt",
    "32768",
    "8",
    "1",
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
      typeof storedHash !== "string" ||
      password.length > 128 ||
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
      algorithm !== "scrypt" ||
      cost !== "32768" ||
      blockSize !== "8" ||
      parallelization !== "1" ||
      !salt ||
      !/^[a-f0-9]{32}$/i.test(salt) ||
      !/^[a-f0-9]{128}$/i.test(expectedHex)
    ) {
      return false;
    }

    const expected = Buffer.from(expectedHex, "hex");

    const actual = (await scrypt(
      password,
      salt,
      KEY_LENGTH,
      SCRYPT_OPTIONS
    )) as Buffer;

    return (
      actual.length === expected.length &&
      timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

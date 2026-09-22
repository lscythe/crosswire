import argon2 from "argon2";

export function validatePassword(password: string) {
  if (password.length < 12) throw new Error("password must be at least 12 characters");
}

export async function hashPassword(password: string) {
  validatePassword(password);
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(encoded: string, password: string) {
  try {
    return await argon2.verify(encoded, password);
  } catch {
    return false;
  }
}

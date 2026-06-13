import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';

const HASH_ITERATIONS = 120000;
const HASH_KEY_LENGTH = 64;
const HASH_DIGEST = 'sha512';
const SALT_BYTE_LENGTH = 16;

export function generateId(): string {
  return randomBytes(16).toString('hex');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTE_LENGTH).toString('hex');
  const hash = pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_DIGEST).toString('hex');
  return `${HASH_ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3) {
    return false;
  }

  const [iterationsStr, salt, hash] = parts;
  const iterations = Number(iterationsStr);

  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  const derived = pbkdf2Sync(password, salt, iterations, HASH_KEY_LENGTH, HASH_DIGEST).toString('hex');

  const derivedBuffer = Buffer.from(derived, 'hex');
  const hashBuffer = Buffer.from(hash, 'hex');
  if (derivedBuffer.length !== hashBuffer.length) {
    return false;
  }

  return timingSafeEqual(derivedBuffer, hashBuffer);
}

export function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}

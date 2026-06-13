import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const TOTP_DIGITS = 6;
const TOTP_TIME_STEP_SECONDS = 30;
const HMAC_ALGORITHM = 'sha1';

function generateHotp(secretHex: string, counter: number, digits = TOTP_DIGITS): string {
  const key = Buffer.from(secretHex, 'hex');
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter), 0);

  const hmac = createHmac(HMAC_ALGORITHM, key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return code.toString().padStart(digits, '0');
}

export function generateTotpSecret(): string {
  return randomBytes(20).toString('hex');
}

export function generateTotpToken(secretHex: string, timeStep = TOTP_TIME_STEP_SECONDS, digits = TOTP_DIGITS): string {
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  return generateHotp(secretHex, counter, digits);
}

export function verifyTotpToken(secretHex: string, token: string, window = 1): boolean {
  if (!token || token.length !== TOTP_DIGITS) {
    return false;
  }

  for (let delta = -window; delta <= window; delta += 1) {
    const candidate = generateHotp(secretHex, Math.floor(Date.now() / 1000 / TOTP_TIME_STEP_SECONDS) + delta);
    if (timingSafeEqual(Buffer.from(candidate), Buffer.from(token))) {
      return true;
    }
  }

  return false;
}

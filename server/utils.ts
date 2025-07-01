import crypto from 'crypto';

/**
 * Generate a secure random token for form authentication
 * @param length Length of the token (default: 32)
 * @returns A secure random token string
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Create an expiration date for form tokens
 * @param minutes Minutes from now (default: 30)
 * @returns Date object for token expiration
 */
export function createTokenExpiration(minutes: number = 30): Date {
  const expiration = new Date();
  expiration.setMinutes(expiration.getMinutes() + minutes);
  return expiration;
}
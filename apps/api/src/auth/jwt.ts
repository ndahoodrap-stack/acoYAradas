import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface TokenPayload {
  sub: string;
  role: string;
  email: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.authSecret, {
    algorithm: 'HS256',
    expiresIn: config.accessTokenTtlSeconds,
    issuer: 'acoyaradas',
  });
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.authSecret, {
      algorithms: ['HS256'],
      issuer: 'acoyaradas',
    });
    if (typeof decoded === 'string' || !decoded.sub) return null;
    return {
      sub: String(decoded.sub),
      role: String((decoded as Record<string, unknown>).role ?? 'customer'),
      email: String((decoded as Record<string, unknown>).email ?? ''),
    };
  } catch {
    return null;
  }
}

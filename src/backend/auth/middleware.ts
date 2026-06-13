import type { JwtPayload } from './jwt';
import { verifyJwtToken } from './jwt';
import type { Role } from './store';

export interface AuthenticatedRequest {
  headers?: Record<string, string | undefined>;
  body?: any;
  params?: Record<string, string>;
  user?: JwtPayload;
}

export interface ResponseLike {
  status(code: number): ResponseLike;
  json(payload: unknown): void;
  send(payload: unknown): void;
}

export type NextFunction = () => void;

export function getBearerToken(headers?: Record<string, string | undefined>): string | null {
  const authHeader = headers?.authorization || headers?.Authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

export function authenticateToken(secret: string) {
  return (req: AuthenticatedRequest, res: ResponseLike, next: NextFunction): void => {
    const token = getBearerToken(req.headers);
    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const payload = verifyJwtToken(token, secret);
    if (!payload || payload.tokenType !== 'access') {
      res.status(401).json({ error: 'Invalid access token' });
      return;
    }

    req.user = payload;
    next();
  };
}

export function authorizeRoles(...allowedRoles: Role[]) {
  return (req: AuthenticatedRequest, res: ResponseLike, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (user.role === 'admin' || allowedRoles.includes(user.role)) {
      next();
      return;
    }

    res.status(403).json({ error: 'Forbidden' });
  };
}

export function requireOwnershipOrRole(
  getOwnerId: (req: AuthenticatedRequest) => string | null,
  ...allowedRoles: Role[]
) {
  return (req: AuthenticatedRequest, res: ResponseLike, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const ownerId = getOwnerId(req);
    if (user.role === 'admin' || allowedRoles.includes(user.role) || (ownerId && ownerId === user.sub)) {
      next();
      return;
    }

    res.status(403).json({ error: 'Forbidden' });
  };
}

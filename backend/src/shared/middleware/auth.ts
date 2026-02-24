import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../../db';

// Роли MintStock
export const ROLES = {
  ADMIN: 'ADMIN',
  OPERATIONS_MANAGER: 'OPERATIONS_MANAGER',
  WAREHOUSE_MANAGER: 'WAREHOUSE_MANAGER',
  PROCUREMENT: 'PROCUREMENT',
  SUPERVISOR: 'SUPERVISOR',
} as const;

export type UserRole = typeof ROLES[keyof typeof ROLES];

declare global {
  namespace Express {
    interface Request {
      user?: {
        username: string;
        role: UserRole;
      };
    }
  }
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  let token: string | null = null;

  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token && req.headers.cookie) {
    const cookies = Object.fromEntries(
      req.headers.cookie.split(';').map(c => {
        const [k, ...v] = c.trim().split('=');
        return [k, v.join('=')];
      })
    );
    token = cookies['mint_session'] ?? null;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as any;
    if (decoded.type && decoded.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const username = decoded.sub || decoded.username;
    if (!username) {
      return res.status(403).json({ error: 'Invalid token: no username' });
    }

    // Получаем роль из MintAuth
    let role: UserRole = ROLES.SUPERVISOR;
    const mintauthUrl = process.env.MINTAUTH_URL || 'http://mintauth-backend:8000';

    try {
      const response = await fetch(`${mintauthUrl}/auth/user-projects?username=${encodeURIComponent(username)}`);
      if (response.ok) {
        const data = await response.json() as {
          is_admin?: boolean;
          projects?: Array<{ project_name: string; role: string }>;
        };
        if (data.is_admin) {
          role = ROLES.ADMIN;
        } else {
          const project = data.projects?.find(p => p.project_name === 'MintStock');
          if (project?.role && Object.values(ROLES).includes(project.role as UserRole)) {
            role = project.role as UserRole;
          }
        }
      }
    } catch {
      // MintAuth недоступен — продолжаем с дефолтной ролью
    }

    req.user = { username, role };
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Middleware для проверки ролей
export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
};

// Хелперы для проверки ролей
export const isAdmin = (role: UserRole) => role === ROLES.ADMIN;
export const isAdminOrOM = (role: UserRole) => ([ROLES.ADMIN, ROLES.OPERATIONS_MANAGER] as UserRole[]).includes(role);
export const canManageWarehouse = (role: UserRole) =>
  ([ROLES.ADMIN, ROLES.OPERATIONS_MANAGER, ROLES.WAREHOUSE_MANAGER] as UserRole[]).includes(role);
export const canManageProcurement = (role: UserRole) =>
  ([ROLES.ADMIN, ROLES.OPERATIONS_MANAGER, ROLES.PROCUREMENT] as UserRole[]).includes(role);

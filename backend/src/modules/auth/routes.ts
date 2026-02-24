import express from 'express';
import { authenticateToken } from '../../shared/middleware/auth';

const router = express.Router();

// GET /api/auth/me - возвращаем информацию о текущем пользователе
router.get('/me', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Пробуем получить full_name и email из MintAuth
    let fullName: string | null = null;
    let email: string | null = null;
    const mintauthUrl = process.env.MINTAUTH_URL || 'http://mintauth-backend:8000';
    try {
      const cookie = req.headers.cookie || '';
      const mintAuthRes = await fetch(`${mintauthUrl}/auth/me`, {
        headers: { Cookie: cookie },
      });
      if (mintAuthRes.ok) {
        const data = await mintAuthRes.json() as { full_name?: string; email?: string };
        fullName = data.full_name ?? null;
        email = data.email ?? null;
      }
    } catch {
      // MintAuth недоступен — продолжаем без доп. полей
    }

    res.json({
      username: req.user.username,
      role: req.user.role,
      full_name: fullName,
      email: email,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/verify - для совместимости с Nginx auth_request
router.post('/verify', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json({
      username: req.user.username,
      role: req.user.role,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

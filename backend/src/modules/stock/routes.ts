import express from 'express';
import { authenticateToken, requireRole, ROLES, canManageWarehouse } from '../../shared/middleware/auth';
import { prisma } from '../../db';
import { logger } from '../../shared/utils/logger';
import { notificationService, NotificationType } from '../../shared/services/notificationService';

const router = express.Router();

// GET /api/stock - Получить остатки с фильтрацией
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { locationId } = req.query;
    const user = req.user!;

    let where: any = {};

    // SUPERVISOR - только свои локации
    if (user.role === ROLES.SUPERVISOR) {
      const assignments = await prisma.supervisorLocation.findMany({
        where: { supervisorId: user.username },
        select: { locationId: true }
      });
      const locationIds = assignments.map(a => a.locationId);
      
      if (locationIds.length === 0) {
        return res.json([]);
      }

      where.locationId = { in: locationIds };
    }

    // Фильтр по конкретной локации
    if (locationId) {
      // Для SUPERVISOR проверяем доступ
      if (user.role === ROLES.SUPERVISOR && !where.locationId?.in?.includes(locationId as string)) {
        return res.status(403).json({ error: 'Access denied to this location' });
      }
      where.locationId = locationId as string;
    }

    const stockItems = await prisma.stockItem.findMany({
      where,
      include: {
        product: {
          include: { category: true }
        },
        location: true
      },
      orderBy: [
        { location: { name: 'asc' } },
        { product: { name: 'asc' } }
      ]
    });

    res.json(stockItems);
  } catch (error) {
    logger.error('Failed to fetch stock', { error });
    res.status(500).json({ error: 'Failed to fetch stock' });
  }
});

// GET /api/stock/low - Товары с низким/нулевым остатком (складские роли)
router.get('/low', authenticateToken, async (req, res) => {
  try {
    if (!canManageWarehouse(req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Находим ЦС (WAREHOUSE)
    const warehouse = await prisma.location.findFirst({
      where: { type: 'WAREHOUSE' }
    });

    if (!warehouse) {
      return res.json([]);
    }

    const lowStock = await prisma.stockItem.findMany({
      where: {
        locationId: warehouse.id,
        quantity: { lte: 0 } // Нулевой или отрицательный
      },
      include: {
        product: {
          include: { category: true }
        },
        location: true
      },
      orderBy: { product: { name: 'asc' } }
    });

    // Отправляем уведомления о низких остатках
    if (lowStock.length > 0) {
      const notifications = lowStock.map(item => ({
        type: NotificationType.LOW_STOCK,
        data: {
          productName: item.product.name,
          categoryName: item.product.category.name,
          quantity: item.quantity,
          unit: item.product.unit,
          limitQty: item.limitQty,
        }
      }));

      // Отправляем пулом
      await notificationService.sendBulk(notifications);
    }

    res.json(lowStock);
  } catch (error) {
    logger.error('Failed to fetch low stock', { error });
    res.status(500).json({ error: 'Failed to fetch low stock' });
  }
});

// PUT /api/stock/initial - Установить начальные остатки (только ADMIN, bulk)
router.put('/initial', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { items } = req.body; // [{ productId, locationId, quantity }]

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    const results = [];
    for (const item of items) {
      const { productId, locationId, quantity } = item;

      if (!productId || !locationId || quantity === undefined) {
        results.push({ ...item, error: 'Missing fields' });
        continue;
      }

      try {
        const stockItem = await prisma.stockItem.upsert({
          where: {
            locationId_productId: {
              productId,
              locationId
            }
          },
          create: {
            productId,
            locationId,
            quantity
          },
          update: {
            quantity
          },
          include: {
            product: true,
            location: true
          }
        });

        results.push({ success: true, stockItem });
      } catch (error: any) {
        results.push({ ...item, error: error.message });
      }
    }

    logger.info('Initial stock set', { count: results.length, by: req.user?.username });
    res.json(results);
  } catch (error) {
    logger.error('Failed to set initial stock', { error });
    res.status(500).json({ error: 'Failed to set initial stock' });
  }
});

// PUT /api/stock/limits - Установить лимиты на объектах (только ADMIN, bulk)
router.put('/limits', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { items } = req.body; // [{ productId, locationId, limitQty }]

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    const results = [];
    for (const item of items) {
      const { productId, locationId, limitQty } = item;

      if (!productId || !locationId || limitQty === undefined) {
        results.push({ ...item, error: 'Missing fields' });
        continue;
      }

      try {
        // Проверка что локация - это SITE
        const location = await prisma.location.findUnique({ where: { id: locationId } });
        if (!location || location.type !== 'SITE') {
          results.push({ ...item, error: 'Limits can only be set for SITE locations' });
          continue;
        }

        const stockItem = await prisma.stockItem.upsert({
          where: {
            locationId_productId: {
              productId,
              locationId
            }
          },
          create: {
            productId,
            locationId,
            quantity: 0,
            limitQty
          },
          update: {
            limitQty
          },
          include: {
            product: true,
            location: true
          }
        });

        results.push({ success: true, stockItem });
      } catch (error: any) {
        results.push({ ...item, error: error.message });
      }
    }

    logger.info('Limits set', { count: results.length, by: req.user?.username });
    res.json(results);
  } catch (error) {
    logger.error('Failed to set limits', { error });
    res.status(500).json({ error: 'Failed to set limits' });
  }
});

export default router;

import express from 'express';
import { authenticateToken, requireRole, ROLES, canManageWarehouse } from '../../shared/middleware/auth';
import { prisma } from '../../db';
import { logger } from '../../shared/utils/logger';
import { notificationService, NotificationType } from '../../shared/services/notificationService';
import { paginate, paginationMiddleware } from '../../shared/utils/pagination';

const router = express.Router();

// GET /api/warehouse/requests - Список запросов (с пагинацией)
router.get('/', authenticateToken, paginationMiddleware, async (req, res) => {
  try {
    const user = req.user!;
    let where: any = {};

    // SUPERVISOR - только свои запросы
    if (user.role === ROLES.SUPERVISOR) {
      where.createdBy = user.username;
    }

    const { status, locationId } = req.query;
    if (status) where.status = status;
    if (locationId) where.locationId = locationId;

    // Используем пагинацию
    const result = await paginate(
      prisma,
      'request',
      {
        where,
        include: {
          location: true,
          items: {
            include: {
              product: {
                include: { category: true }
              }
            }
          },
          _count: {
            select: { issueRecords: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      },
      req.pagination
    );

    res.json(result);
  } catch (error) {
    logger.error('Failed to fetch requests', { error });
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// POST /api/warehouse/requests - Создать запрос (только SUPERVISOR)
router.post('/', authenticateToken, requireRole(ROLES.SUPERVISOR), async (req, res) => {
  try {
    const { locationId, items, note } = req.body; // items: [{ productId, quantity }]

    if (!locationId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'LocationId and items are required' });
    }

    // Проверка что локация назначена этому супервайзору
    const assignment = await prisma.supervisorLocation.findUnique({
      where: {
        supervisorId_locationId: {
          supervisorId: req.user!.username,
          locationId
        }
      }
    });

    if (!assignment) {
      return res.status(403).json({ error: 'You are not assigned to this location' });
    }

    // Создаём запрос с items в транзакции
    const request = await prisma.request.create({
      data: {
        locationId,
        createdBy: req.user!.username,
        note,
        status: 'PENDING',
        items: {
          create: items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            issued: 0
          }))
        }
      },
      include: {
        location: true,
        items: {
          include: {
            product: {
              include: { category: true }
            }
          }
        }
      }
    });

    // Отправляем уведомление складовщикам (через MintAuth API или напрямую)
    // Примечание: таблица users находится в MintAuth, поэтому используем заглушку
    // В production нужно сделать запрос к MintAuth API для получения списка пользователей
    logger.info('Notification queued for warehouse managers', { 
      requestId: request.id,
      type: NotificationType.REQUEST_CREATED 
    });

    // TODO: Интеграция с MintAuth для получения списка пользователей
    /*
    const warehouseManagers = await prisma.$queryRaw`
      SELECT username FROM users WHERE role IN ('WAREHOUSE_MANAGER', 'OPERATIONS_MANAGER', 'ADMIN')
    `;

    await notificationService.sendBulk(
      warehouseManagers.map((user: any) => ({
        type: NotificationType.REQUEST_CREATED,
        recipientUsername: user.username,
        data: {
          locationName: request.location.name,
          itemsCount: items.length,
          createdBy: req.user!.username,
        }
      }))
    );
    */

    logger.info('Request created', { requestId: request.id, locationId, itemsCount: items.length, by: req.user?.username });
    res.status(201).json(request);
  } catch (error) {
    logger.error('Failed to create request', { error });
    res.status(500).json({ error: 'Failed to create request' });
  }
});

// GET /api/warehouse/requests/:id - Детали запроса
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const request = await prisma.request.findUnique({
      where: { id },
      include: {
        location: true,
        items: {
          include: {
            product: {
              include: { category: true }
            }
          }
        },
        issueRecords: {
          include: {
            // Нет прямой связи с product в IssueRecord, поэтому загружаем отдельно
          },
          orderBy: { issuedAt: 'desc' }
        }
      }
    });

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // SUPERVISOR может видеть только свои
    if (user.role === ROLES.SUPERVISOR && request.createdBy !== user.username) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(request);
  } catch (error) {
    logger.error('Failed to fetch request details', { error });
    res.status(500).json({ error: 'Failed to fetch request details' });
  }
});

// PATCH /api/warehouse/requests/:id/status - Изменить статус (складские роли)
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    if (!canManageWarehouse(req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;
    const { status } = req.body; // APPROVED, REJECTED

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const request = await prisma.request.findUnique({ where: { id } });
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Can only change status of PENDING requests' });
    }

    const updated = await prisma.request.update({
      where: { id },
      data: { status },
      include: {
        location: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    logger.info('Request status changed', { requestId: id, status, by: req.user?.username });
    res.json(updated);
  } catch (error) {
    logger.error('Failed to change request status', { error });
    res.status(500).json({ error: 'Failed to change request status' });
  }
});

// GET /api/warehouse/requests/:locationId/autofill - Авто-расчёт до лимита (SUPERVISOR)
router.get('/:locationId/autofill', authenticateToken, requireRole(ROLES.SUPERVISOR), async (req, res) => {
  try {
    const { locationId } = req.params;

    // Проверка доступа
    const assignment = await prisma.supervisorLocation.findUnique({
      where: {
        supervisorId_locationId: {
          supervisorId: req.user!.username,
          locationId
        }
      }
    });

    if (!assignment) {
      return res.status(403).json({ error: 'You are not assigned to this location' });
    }

    // Получаем все товары с лимитами для этой локации
    const stockItems = await prisma.stockItem.findMany({
      where: {
        locationId,
        limitQty: { not: null }
      },
      include: {
        product: {
          include: { category: true }
        }
      }
    });

    // Рассчитываем нужное количество: limitQty - quantity
    const autofill = stockItems.map(item => ({
      productId: item.productId,
      product: item.product,
      currentQty: item.quantity,
      limitQty: item.limitQty,
      quantity: Math.max(0, (item.limitQty ?? 0) - item.quantity)
    })).filter(item => item.quantity > 0); // Только те, где нужно пополнение

    res.json(autofill);
  } catch (error) {
    logger.error('Failed to autofill', { error });
    res.status(500).json({ error: 'Failed to autofill' });
  }
});

export default router;

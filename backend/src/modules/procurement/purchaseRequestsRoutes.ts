import express from 'express';
import { authenticateToken, canManageWarehouse, canManageProcurement } from '../../shared/middleware/auth';
import { prisma } from '../../db';
import { logger } from '../../shared/utils/logger';

const router = express.Router();

// GET /api/procurement/purchase-requests - Список заявок на закупку
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status } = req.query;
    let where: any = {};
    if (status) where.status = status;

    const requests = await prisma.purchaseRequest.findMany({
      where,
      include: {
        items: {
          include: {
            product: {
              include: { category: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(requests);
  } catch (error) {
    logger.error('Failed to fetch purchase requests', { error });
    res.status(500).json({ error: 'Failed to fetch purchase requests' });
  }
});

// POST /api/procurement/purchase-requests - Создать заявку (WAREHOUSE roles)
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (!canManageWarehouse(req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { items, note } = req.body; // items: [{ productId, quantity }]

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items are required' });
    }

    const purchaseRequest = await prisma.purchaseRequest.create({
      data: {
        createdBy: req.user!.username,
        note,
        status: 'PENDING',
        items: {
          create: items.map(item => ({
            productId: item.productId,
            quantity: item.quantity
          }))
        }
      },
      include: {
        items: {
          include: {
            product: {
              include: { category: true }
            }
          }
        }
      }
    });

    logger.info('Purchase request created', { id: purchaseRequest.id, itemsCount: items.length, by: req.user?.username });
    res.status(201).json(purchaseRequest);
  } catch (error) {
    logger.error('Failed to create purchase request', { error });
    res.status(500).json({ error: 'Failed to create purchase request' });
  }
});

// GET /api/procurement/purchase-requests/:id - Детали заявки
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const purchaseRequest = await prisma.purchaseRequest.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              include: { category: true }
            }
          }
        }
      }
    });

    if (!purchaseRequest) {
      return res.status(404).json({ error: 'Purchase request not found' });
    }

    res.json(purchaseRequest);
  } catch (error) {
    logger.error('Failed to fetch purchase request details', { error });
    res.status(500).json({ error: 'Failed to fetch purchase request details' });
  }
});

// PATCH /api/procurement/purchase-requests/:id/status - Изменить статус (PROCUREMENT)
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    if (!canManageProcurement(req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;
    const { status } = req.body; // IN_PROGRESS, DONE

    if (!['IN_PROGRESS', 'DONE'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const purchaseRequest = await prisma.purchaseRequest.findUnique({ where: { id } });
    if (!purchaseRequest) {
      return res.status(404).json({ error: 'Purchase request not found' });
    }

    if (purchaseRequest.status !== 'PENDING') {
      return res.status(400).json({ error: 'Can only change status of PENDING requests' });
    }

    const updated = await prisma.purchaseRequest.update({
      where: { id },
      data: { status },
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });

    logger.info('Purchase request status changed', { id, status, by: req.user?.username });
    res.json(updated);
  } catch (error) {
    logger.error('Failed to change purchase request status', { error });
    res.status(500).json({ error: 'Failed to change purchase request status' });
  }
});

export default router;

import express from 'express';
import { authenticateToken, canManageWarehouse, requireRole, ROLES } from '../../shared/middleware/auth';
import { prisma } from '../../db';
import { logger } from '../../shared/utils/logger';

const router = express.Router();

// GET /api/warehouse/inventory - Список инвентаризаций
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user!;
    let where: any = {};

    // SUPERVISOR - только свои инвентаризации
    if (user.role === ROLES.SUPERVISOR) {
      where.conductedBy = user.username;
    }

    const { status, locationId } = req.query;
    if (status) where.status = status;
    if (locationId) where.locationId = locationId;

    const inventories = await prisma.inventory.findMany({
      where,
      include: {
        location: true,
        _count: {
          select: { items: true }
        }
      },
      orderBy: { startedAt: 'desc' }
    });

    res.json(inventories);
  } catch (error) {
    logger.error('Failed to fetch inventories', { error });
    res.status(500).json({ error: 'Failed to fetch inventories' });
  }
});

// POST /api/warehouse/inventory - Начать инвентаризацию (SUPERVISOR или WAREHOUSE)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user!;
    const { locationId, note } = req.body;

    if (!locationId) {
      return res.status(400).json({ error: 'LocationId is required' });
    }

    // Если SUPERVISOR - проверяем доступ
    if (user.role === ROLES.SUPERVISOR) {
      const assignment = await prisma.supervisorLocation.findUnique({
        where: {
          supervisorId_locationId: {
            supervisorId: user.username,
            locationId
          }
        }
      });

      if (!assignment) {
        return res.status(403).json({ error: 'You are not assigned to this location' });
      }
    }

    // Создаём инвентаризацию с items на основе текущих StockItem
    const inventory = await prisma.$transaction(async (tx) => {
      const inv = await tx.inventory.create({
        data: {
          locationId,
          conductedBy: user.username,
          note,
          status: 'IN_PROGRESS'
        }
      });

      // Все товары с остатками на этой локации
      const stockItems = await tx.stockItem.findMany({
        where: { locationId }
      });

      // Создаём InventoryItem для каждого товара с systemQty = текущий остаток
      if (stockItems.length > 0) {
        await tx.inventoryItem.createMany({
          data: stockItems.map(si => ({
            inventoryId: inv.id,
            productId: si.productId,
            systemQty: si.quantity,
            actualQty: 0,
            difference: 0
          }))
        });
      }

      return inv;
    });

    const fullInventory = await prisma.inventory.findUnique({
      where: { id: inventory.id },
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

    logger.info('Inventory started', { inventoryId: inventory.id, locationId, by: user.username });
    res.status(201).json(fullInventory);
  } catch (error) {
    logger.error('Failed to start inventory', { error });
    res.status(500).json({ error: 'Failed to start inventory' });
  }
});

// GET /api/warehouse/inventory/:id - Детали инвентаризации
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const inventory = await prisma.inventory.findUnique({
      where: { id },
      include: {
        location: true,
        items: {
          include: {
            product: {
              include: { category: true }
            }
          },
          orderBy: {
            product: {
              name: 'asc'
            }
          }
        }
      }
    });

    if (!inventory) {
      return res.status(404).json({ error: 'Inventory not found' });
    }

    // SUPERVISOR может видеть только свои
    if (user.role === ROLES.SUPERVISOR && inventory.conductedBy !== user.username) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(inventory);
  } catch (error) {
    logger.error('Failed to fetch inventory details', { error });
    res.status(500).json({ error: 'Failed to fetch inventory details' });
  }
});

// PUT /api/warehouse/inventory/:id/items - Обновить actualQty для items
router.put('/:id/items', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body; // items: [{ productId, actualQty }]

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    const inventory = await prisma.inventory.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!inventory) {
      return res.status(404).json({ error: 'Inventory not found' });
    }

    if (inventory.status !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'Can only update items for IN_PROGRESS inventory' });
    }

    // Обновляем actualQty для каждого товара
    await prisma.$transaction(
      items.map(item =>
        prisma.inventoryItem.updateMany({
          where: {
            inventoryId: id,
            productId: item.productId
          },
          data: {
            actualQty: item.actualQty
          }
        })
      )
    );

    const updated = await prisma.inventory.findUnique({
      where: { id },
      include: {
        location: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    logger.info('Inventory items updated', { inventoryId: id, itemsCount: items.length });
    res.json(updated);
  } catch (error) {
    logger.error('Failed to update inventory items', { error });
    res.status(500).json({ error: 'Failed to update inventory items' });
  }
});

// POST /api/warehouse/inventory/:id/close - Закрыть инвентаризацию (WAREHOUSE roles)
router.post('/:id/close', authenticateToken, async (req, res) => {
  try {
    if (!canManageWarehouse(req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;

    const inventory = await prisma.inventory.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!inventory) {
      return res.status(404).json({ error: 'Inventory not found' });
    }

    if (inventory.status !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'Can only close IN_PROGRESS inventory' });
    }

    // Проверяем что все items имеют actualQty
    const missingActual = inventory.items.filter(item => item.actualQty === null);
    if (missingActual.length > 0) {
      return res.status(400).json({ 
        error: 'All items must have actualQty before closing',
        missingCount: missingActual.length
      });
    }

    // Закрываем инвентаризацию: обновляем difference, StockItem.quantity = actualQty
    const result = await prisma.$transaction(async (tx) => {
      // 1. Рассчитываем и обновляем difference для всех items
      for (const item of inventory.items) {
        const difference = (item.actualQty ?? 0) - item.systemQty;
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { difference }
        });
      }

      // 2. Обновляем StockItem.quantity = actualQty
      for (const item of inventory.items) {
        await tx.stockItem.update({
          where: {
            locationId_productId: {
              locationId: inventory.locationId,
              productId: item.productId
            }
          },
          data: {
            quantity: item.actualQty!
          }
        });
      }

      // 3. Закрываем инвентаризацию
      const closed = await tx.inventory.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          closedAt: new Date()
        }
      });

      return closed;
    });

    const fullInventory = await prisma.inventory.findUnique({
      where: { id },
      include: {
        location: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    logger.info('Inventory closed', { inventoryId: id, by: req.user?.username });
    res.json(fullInventory);
  } catch (error) {
    logger.error('Failed to close inventory', { error });
    res.status(500).json({ error: 'Failed to close inventory' });
  }
});

export default router;

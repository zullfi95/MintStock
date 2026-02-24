import express from 'express';
import { authenticateToken, requireRole, ROLES, canManageProcurement, isAdminOrOM } from '../../shared/middleware/auth';
import { prisma } from '../../db';
import { logger } from '../../shared/utils/logger';

const router = express.Router();

// GET /api/suppliers - Список поставщиков (все кроме SUPERVISOR)
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (req.user?.role === ROLES.SUPERVISOR) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { isActive } = req.query;
    const where: any = {};
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const suppliers = await prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' }
    });

    res.json(suppliers);
  } catch (error) {
    logger.error('Failed to fetch suppliers', { error });
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});

// POST /api/suppliers - Создать поставщика (ADMIN, OM)
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (!isAdminOrOM(req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { name, contact, phone, email, telegramId } = req.body;

    if (!name || !contact) {
      return res.status(400).json({ error: 'Name and contact are required' });
    }

    const supplier = await prisma.supplier.create({
      data: { name, contact, phone, email, telegramId }
    });

    logger.info('Supplier created', { supplierId: supplier.id, name: supplier.name, by: req.user?.username });
    res.status(201).json(supplier);
  } catch (error) {
    logger.error('Failed to create supplier', { error });
    res.status(500).json({ error: 'Failed to create supplier' });
  }
});

// PUT /api/suppliers/:id - Редактировать поставщика (ADMIN, OM)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    if (!isAdminOrOM(req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;
    const { name, contact, phone, email, telegramId } = req.body;

    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(contact && { contact }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(telegramId !== undefined && { telegramId })
      }
    });

    logger.info('Supplier updated', { supplierId: updated.id, by: req.user?.username });
    res.json(updated);
  } catch (error) {
    logger.error('Failed to update supplier', { error });
    res.status(500).json({ error: 'Failed to update supplier' });
  }
});

// PATCH /api/suppliers/:id/toggle - Включить/выключить (только ADMIN)
router.patch('/:id/toggle', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;

    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: { isActive: !supplier.isActive }
    });

    logger.info('Supplier toggled', { supplierId: updated.id, isActive: updated.isActive, by: req.user?.username });
    res.json(updated);
  } catch (error) {
    logger.error('Failed to toggle supplier', { error });
    res.status(500).json({ error: 'Failed to toggle supplier' });
  }
});

// GET /api/suppliers/:id/prices - Получить цены поставщика
router.get('/:id/prices', authenticateToken, async (req, res) => {
  try {
    if (req.user?.role === ROLES.SUPERVISOR) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;

    const prices = await prisma.supplierPrice.findMany({
      where: { supplierId: id },
      include: {
        product: {
          include: { category: true }
        }
      },
      orderBy: { product: { name: 'asc' } }
    });

    res.json(prices);
  } catch (error) {
    logger.error('Failed to fetch supplier prices', { error });
    res.status(500).json({ error: 'Failed to fetch supplier prices' });
  }
});

// POST /api/suppliers/:id/prices - Установить цену товара
router.post('/:id/prices', authenticateToken, async (req, res) => {
  try {
    if (!canManageProcurement(req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;
    const { productId, price } = req.body;

    if (!productId || price === undefined || price < 0) {
      return res.status(400).json({ error: 'Valid productId and price are required' });
    }

    // Проверка существования поставщика и товара
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Upsert цены
    const supplierPrice = await prisma.supplierPrice.upsert({
      where: {
        supplierId_productId: {
          supplierId: id,
          productId
        }
      },
      create: {
        supplierId: id,
        productId,
        price
      },
      update: {
        price
      },
      include: {
        product: true
      }
    });

    logger.info('Supplier price set', { supplierId: id, productId, price, by: req.user?.username });
    res.json(supplierPrice);
  } catch (error) {
    logger.error('Failed to set supplier price', { error });
    res.status(500).json({ error: 'Failed to set supplier price' });
  }
});

export default router;

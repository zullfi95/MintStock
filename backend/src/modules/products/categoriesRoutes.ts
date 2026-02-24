import express from 'express';
import { authenticateToken, requireRole, ROLES } from '../../shared/middleware/auth';
import { prisma } from '../../db';
import { logger } from '../../shared/utils/logger';

const router = express.Router();

// GET /api/categories - Список всех категорий
router.get('/', authenticateToken, async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { products: true }
        }
      }
    });
    res.json(categories);
  } catch (error) {
    logger.error('Failed to fetch categories', { error });
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST /api/categories - Создать категорию (только ADMIN)
router.post('/', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Проверка на дубликат
    const existing = await prisma.category.findUnique({ where: { name: name.trim() } });
    if (existing) {
      return res.status(409).json({ error: 'Category already exists' });
    }

    const category = await prisma.category.create({
      data: { name: name.trim() }
    });

    logger.info('Category created', { categoryId: category.id, name: category.name, by: req.user?.username });
    res.status(201).json(category);
  } catch (error) {
    logger.error('Failed to create category', { error });
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// PUT /api/categories/:id - Редактировать категорию (только ADMIN)
router.put('/:id', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Проверка на дубликат (кроме себя)
    const existing = await prisma.category.findFirst({
      where: { name: name.trim(), id: { not: id } }
    });
    if (existing) {
      return res.status(409).json({ error: 'Category with this name already exists' });
    }

    const updated = await prisma.category.update({
      where: { id },
      data: { name: name.trim() }
    });

    logger.info('Category updated', { categoryId: updated.id, name: updated.name, by: req.user?.username });
    res.json(updated);
  } catch (error) {
    logger.error('Failed to update category', { error });
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE /api/categories/:id - Удалить категорию (только ADMIN)
router.delete('/:id', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;

    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true }
        }
      }
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    if (category._count.products > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete category with existing products. Remove or reassign products first.' 
      });
    }

    await prisma.category.delete({
      where: { id }
    });

    logger.info('Category deleted', { categoryId: id, by: req.user?.username });
    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete category', { error });
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;

import express from 'express';
import { authenticateToken, requireRole, ROLES } from '../../shared/middleware/auth';
import { prisma } from '../../db';
import { logger } from '../../shared/utils/logger';
import { upload } from '../../shared/utils/upload';
import ExcelJS from 'exceljs';

const router = express.Router();

// GET /api/products - Список товаров с фильтрами
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { categoryId, isActive } = req.query;
    
    const where: any = {};
    if (categoryId) where.categoryId = categoryId as string;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const products = await prisma.product.findMany({
      where,
      include: {
        category: true
      },
      orderBy: { name: 'asc' }
    });

    res.json(products);
  } catch (error) {
    logger.error('Failed to fetch products', { error });
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// POST /api/products - Создать товар (только ADMIN)
router.post('/', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { name, categoryId, unit } = req.body;

    if (!name || !categoryId || !unit) {
      return res.status(400).json({ error: 'Name, categoryId, and unit are required' });
    }

    // Проверка категории
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const product = await prisma.product.create({
      data: { name, categoryId, unit },
      include: { category: true }
    });

    logger.info('Product created', { productId: product.id, name: product.name, by: req.user?.username });
    res.status(201).json(product);
  } catch (error) {
    logger.error('Failed to create product', { error });
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// PUT /api/products/:id - Редактировать товар (только ADMIN)
router.put('/:id', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, categoryId, unit, isActive } = req.body;

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(categoryId && { categoryId }),
        ...(unit && { unit }),
        ...(isActive !== undefined && { isActive })
      },
      include: { category: true }
    });

    logger.info('Product updated', { productId: updated.id, by: req.user?.username });
    res.json(updated);
  } catch (error) {
    logger.error('Failed to update product', { error });
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// PATCH /api/products/:id/toggle - Включить/выключить товар (только ADMIN)
router.patch('/:id/toggle', authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const updated = await prisma.product.update({
      where: { id },
      data: { isActive: !product.isActive },
      include: { category: true }
    });

    logger.info('Product toggled', { productId: updated.id, isActive: updated.isActive, by: req.user?.username });
    res.json(updated);
  } catch (error) {
    logger.error('Failed to toggle product', { error });
    res.status(500).json({ error: 'Failed to toggle product' });
  }
});

// POST /api/products/import - Импорт товаров из Excel (только ADMIN)
router.post('/import', authenticateToken, requireRole(ROLES.ADMIN), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer as any);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      return res.status(400).json({ error: 'No worksheet found in file' });
    }

    const imported: any[] = [];
    const errors: any[] = [];

    // Пропускаем первую строку (заголовки)
    for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);
      const name = row.getCell(1).text.trim();
      const categoryName = row.getCell(2).text.trim();
      const unit = row.getCell(3).text.trim();

      if (!name || !categoryName || !unit) {
        errors.push({ row: rowNum, error: 'Missing required fields' });
        continue;
      }

      try {
        // Найти или создать категорию
        let category = await prisma.category.findUnique({ where: { name: categoryName } });
        if (!category) {
          category = await prisma.category.create({ data: { name: categoryName } });
        }

        // Создать товар
        const product = await prisma.product.create({
          data: { name, categoryId: category.id, unit },
          include: { category: true }
        });

        imported.push(product);
      } catch (error: any) {
        errors.push({ row: rowNum, error: error.message });
      }
    }

    logger.info('Products imported', { count: imported.length, errors: errors.length, by: req.user?.username });
    res.json({ imported: imported.length, errors });
  } catch (error) {
    logger.error('Failed to import products', { error });
    res.status(500).json({ error: 'Failed to import products' });
  }
});

export default router;

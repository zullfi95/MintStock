import express from 'express';
import { authenticateToken, canManageWarehouse } from '../../shared/middleware/auth';
import { prisma } from '../../db';
import { logger } from '../../shared/utils/logger';

const router = express.Router();

// POST /api/warehouse/issue - Выдать товары по запросу (WAREHOUSE/OPERATIONS)
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (!canManageWarehouse(req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { requestId, items, note } = req.body; // items: [{ productId, quantity }]

    if (!requestId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'RequestId and items are required' });
    }

    const request = await prisma.request.findUnique({
      where: { id: requestId },
      include: {
        location: true,
        items: true
      }
    });

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Can only issue items for APPROVED requests' });
    }

    // Находим WAREHOUSE location (тип WAREHOUSE)
    const warehouse = await prisma.location.findFirst({
      where: { type: 'WAREHOUSE' }
    });

    if (!warehouse) {
      return res.status(500).json({ error: 'Warehouse location not found' });
    }

    // Используем транзакцию для всех изменений
    const result = await prisma.$transaction(async (tx) => {
      const createdIssueRecords: any[] = [];

      // 1. Создаём IssueRecord для каждого товара
      for (const item of items) {
        const { productId, quantity } = item;

        if (quantity <= 0) continue;

        // Проверяем что товар есть в запросе
        const requestItem = request.items.find(ri => ri.productId === productId);
        if (!requestItem) continue;

        // Проверяем остаток на складе
        const warehouseStock = await tx.stockItem.findUnique({
          where: {
            locationId_productId: {
              locationId: warehouse.id,
              productId
            }
          }
        });

        if (!warehouseStock || warehouseStock.quantity < quantity) {
          continue; // Пропускаем если недостаточно на складе
        }

        // Создаём IssueRecord
        const issueRecord = await tx.issueRecord.create({
          data: {
            requestId,
            productId,
            quantity,
            issuedBy: req.user!.username,
            note
          },
          include: {
            product: true
          }
        });

        createdIssueRecords.push(issueRecord);

        // 2. Уменьшаем остаток на складе
        await tx.stockItem.update({
          where: {
            locationId_productId: {
              locationId: warehouse.id,
              productId
            }
          },
          data: {
            quantity: { decrement: quantity }
          }
        });

        // 3. Увеличиваем остаток на SITE
        await tx.stockItem.upsert({
          where: {
            locationId_productId: {
              locationId: request.locationId,
              productId
            }
          },
          update: {
            quantity: { increment: quantity }
          },
          create: {
            locationId: request.locationId,
            productId,
            quantity,
            limitQty: null
          }
        });

        // 4. Обновляем RequestItem.issued
        await tx.requestItem.update({
          where: { id: requestItem.id },
          data: {
            issued: { increment: quantity }
          }
        });
      }

      // 5. Обновляем статус Request
      const updatedRequestItems = await tx.requestItem.findMany({
        where: { requestId }
      });

      const allFulfilled = updatedRequestItems.every(ri => ri.issued >= ri.quantity);
      const anyIssued = updatedRequestItems.some(ri => ri.issued > 0);

      let newStatus = request.status;
      if (allFulfilled) {
        newStatus = 'FULFILLED';
      } else if (anyIssued) {
        newStatus = 'PARTIAL';
      }

      await tx.request.update({
        where: { id: requestId },
        data: { status: newStatus }
      });

      return { issueRecords: createdIssueRecords };
    });

    logger.info('Issue created', { requestId, issuesCount: result.issueRecords.length, by: req.user?.username });
    res.status(201).json(result.issueRecords);
  } catch (error) {
    logger.error('Failed to issue items', { error });
    res.status(500).json({ error: 'Failed to issue items' });
  }
});

// GET /api/warehouse/issue/:id - Детали выдачи
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const issue = await prisma.issueRecord.findUnique({
      where: { id },
      include: {
        request: {
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
        },
        product: {
          include: { category: true }
        }
      }
    });

    if (!issue) {
      return res.status(404).json({ error: 'Issue record not found' });
    }

    res.json(issue);
  } catch (error) {
    logger.error('Failed to fetch issue details', { error });
    res.status(500).json({ error: 'Failed to fetch issue details' });
  }
});

// GET /api/warehouse/issue - Список всех выдач
router.get('/', authenticateToken, async (req, res) => {
  try {
    const issues = await prisma.issueRecord.findMany({
      include: {
        product: {
          include: { category: true }
        },
        request: {
          include: {
            location: true
          }
        }
      },
      orderBy: { issuedAt: 'desc' }
    });

    res.json(issues);
  } catch (error) {
    logger.error('Failed to fetch issue records', { error });
    res.status(500).json({ error: 'Failed to fetch issue records' });
  }
});

export default router;

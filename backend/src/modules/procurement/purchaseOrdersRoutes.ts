import express from 'express';
import { authenticateToken, canManageProcurement } from '../../shared/middleware/auth';
import { prisma } from '../../db';
import { logger } from '../../shared/utils/logger';
import { generatePO } from '../../shared/services/pdfService';
import { sendPOByEmail } from '../../shared/services/emailService';
import { sendPO } from '../../shared/services/telegramService';
import { upload } from '../../shared/utils/upload';
import { notificationService, NotificationType } from '../../shared/services/notificationService';

const router = express.Router();

// Генерация poNumber: PO-2026-0001
async function generatePONumber(): Promise<string> {
  const year = new Date().getFullYear();
  const lastPO = await prisma.purchaseOrder.findFirst({
    where: {
      poNumber: {
        startsWith: `PO-${year}-`
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  let nextNumber = 1;
  if (lastPO) {
    const match = lastPO.poNumber.match(/PO-\d{4}-(\d+)/);
    if (match) {
      nextNumber = parseInt(match[1]) + 1;
    }
  }

  return `PO-${year}-${nextNumber.toString().padStart(4, '0')}`;
}

// GET /api/procurement/purchase-orders - Список заказов
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, supplierId } = req.query;
    let where: any = {};
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;

    const orders = await prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: true,
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

    res.json(orders);
  } catch (error) {
    logger.error('Failed to fetch purchase orders', { error });
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
});

// POST /api/procurement/purchase-orders - Создать PO (PROCUREMENT)
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (!canManageProcurement(req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { supplierId, items, note, deliveryDate, purchaseRequestId } = req.body; // items: [{ productId, quantity, unitPrice }]

    if (!supplierId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'SupplierId and items are required' });
    }

    // Генерируем poNumber
    const poNumber = await generatePONumber();

    // Рассчитываем totalAmount и totalPrice для items
    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        supplierId,
        createdBy: req.user!.username,
        note,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : undefined,
        status: 'DRAFT',
        totalAmount,
        items: {
          create: items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
            receivedQty: 0
          }))
        }
      },
      include: {
        supplier: true,
        items: {
          include: {
            product: {
              include: { category: true }
            }
          }
        }
      }
    });

    // Если PO создан из PurchaseRequest, обновляем его статус и связываем
    if (purchaseRequestId) {
      await prisma.purchaseRequest.update({
        where: { id: purchaseRequestId },
        data: {
          status: 'IN_PROGRESS',
          poId: purchaseOrder.id
        }
      });
      logger.info('PurchaseRequest linked to PO', { purchaseRequestId, poId: purchaseOrder.id });
    }

    // Отправляем уведомление о создании PO
    await notificationService.send({
      type: NotificationType.PO_CREATED,
      data: {
        poNumber: purchaseOrder.poNumber,
        supplierName: purchaseOrder.supplier.name,
        totalAmount: purchaseOrder.totalAmount,
        deliveryDate: purchaseOrder.deliveryDate,
      }
    });

    logger.info('Purchase order created', { id: purchaseOrder.id, poNumber, supplierId, totalAmount, by: req.user?.username });
    res.status(201).json(purchaseOrder);
  } catch (error) {
    logger.error('Failed to create purchase order', { error });
    res.status(500).json({ error: 'Failed to create purchase order' });
  }
});

// GET /api/procurement/purchase-orders/:id - Детали PO
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: {
          include: {
            product: {
              include: { category: true }
            }
          }
        }
      }
    });

    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    res.json(po);
  } catch (error) {
    logger.error('Failed to fetch PO details', { error });
    res.status(500).json({ error: 'Failed to fetch PO details' });
  }
});

// PUT /api/procurement/purchase-orders/:id - Обновить PO (только PENDING)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    if (!canManageProcurement(req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;
    const { items, note, deliveryDate } = req.body;

    const po = await prisma.purchaseOrder.findUnique({
      where: { id }
    });

    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    if (po.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Can only update DRAFT purchase orders' });
    }

    const totalAmount = items ? items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0) : po.totalAmount;

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        note,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : undefined,
        totalAmount,
        items: items ? {
          deleteMany: {},
          create: items.map((item: any) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
            receivedQty: 0
          }))
        } : undefined
      },
      include: {
        supplier: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    logger.info('Purchase order updated', { id, by: req.user?.username });
    res.json(updated);
  } catch (error) {
    logger.error('Failed to update purchase order', { error });
    res.status(500).json({ error: 'Failed to update purchase order' });
  }
});

// GET /api/procurement/purchase-orders/:id/pdf - Скачать PDF
router.get('/:id/pdf', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: {
          include: {
            product: {
              include: { category: true }
            }
          }
        },
        receiveRecords: true
      }
    });

    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    const pdfBuffer = await generatePO(po);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${po.poNumber}.pdf"`);
    res.send(pdfBuffer);

    logger.info('PO PDF downloaded', { id, by: req.user?.username });
  } catch (error) {
    logger.error('Failed to generate PDF', { error });
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// POST /api/procurement/purchase-orders/:id/send - Отправить PO (email/telegram)
router.post('/:id/send', authenticateToken, async (req, res) => {
  try {
    if (!canManageProcurement(req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;
    const { method } = req.body; // 'email' or 'telegram'

    if (!['email', 'telegram'].includes(method)) {
      return res.status(400).json({ error: 'Invalid method. Use "email" or "telegram"' });
    }

    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    const pdfBuffer = await generatePO(po);

    try {
      if (method === 'email') {
        if (!po.supplier.email) {
          return res.status(400).json({ error: 'Supplier has no email' });
        }
        await sendPOByEmail(po.supplier.email, po.poNumber, pdfBuffer);
      } else if (method === 'telegram') {
        if (!po.supplier.telegramId) {
          return res.status(400).json({ error: 'Supplier has no telegram ID' });
        }
        await sendPO(po.supplier.telegramId, pdfBuffer, po.poNumber);
      }

      // Обновляем статус на SENT
      await prisma.purchaseOrder.update({
        where: { id },
        data: { status: 'SENT' }
      });

      logger.info('PO sent', { id, method, by: req.user?.username });
      res.json({ success: true, message: `PO sent via ${method}` });
    } catch (sendError) {
      logger.error('Failed to send PO', { error: sendError });
      return res.status(500).json({ error: `Failed to send via ${method}` });
    }
  } catch (error) {
    logger.error('Failed to send PO', { error });
    res.status(500).json({ error: 'Failed to send PO' });
  }
});

// POST /api/procurement/purchase-orders/:id/receive - Принять товары (WAREHOUSE)
router.post('/:id/receive', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { items, note } = req.body; // items: [{ productId, receivedQty }]
    const photoFile = req.file;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items are required' });
    }

    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    if (po.status !== 'SENT' && po.status !== 'RECEIVED' && po.status !== 'PARTIALLY_RECEIVED') {
      return res.status(400).json({ error: 'Can only receive items for SENT, PARTIALLY_RECEIVED or RECEIVED orders' });
    }

    // Находим WAREHOUSE location
    const warehouse = await prisma.location.findFirst({
      where: { type: 'WAREHOUSE' }
    });

    if (!warehouse) {
      return res.status(500).json({ error: 'Warehouse location not found' });
    }

    // Формируем photoUrl если есть файл
    const photoUrl = photoFile ? `/uploads/${photoFile.filename}` : undefined;

    // Транзакция: обновляем receivedQty, StockItem, создаём ReceiveRecord
    const result = await prisma.$transaction(async (tx) => {
      const receiveRecord = await tx.receiveRecord.create({
        data: {
          poId: id,
          receivedBy: req.user!.username,
          note,
          photoUrl
        }
      });

      for (const item of items) {
        const { productId, receivedQty } = item;

        if (receivedQty <= 0) continue;

        // Обновляем PurchaseOrderItem.receivedQty
        const poItem = po.items.find(pi => pi.productId === productId);
        if (!poItem) continue;

        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: {
            receivedQty: { increment: receivedQty }
          }
        });

        // Увеличиваем склад
        await tx.stockItem.upsert({
          where: {
            locationId_productId: {
              locationId: warehouse.id,
              productId
            }
          },
          update: {
            quantity: { increment: receivedQty }
          },
          create: {
            locationId: warehouse.id,
            productId,
            quantity: receivedQty,
            limitQty: null
          }
        });
      }

      // Обновляем статус PO
      const updatedItems = await tx.purchaseOrderItem.findMany({
        where: { poId: id }
      });

      const allReceived = updatedItems.every(item => item.receivedQty >= item.quantity);
      const anyReceived = updatedItems.some(item => item.receivedQty > 0);
      const hasPartial = updatedItems.some(item => item.receivedQty > 0 && item.receivedQty < item.quantity);

      let newStatus = po.status;
      if (allReceived) {
        newStatus = 'RECEIVED';
      } else if (hasPartial || anyReceived) {
        // Частичная приёмка - устанавливаем PARTIALLY_RECEIVED
        newStatus = 'PARTIALLY_RECEIVED';
      }

      await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: newStatus,
          receivedAt: allReceived ? new Date() : undefined
        }
      });

      return { receiveRecord, itemsReceived: items.length };
    });

    // Отправляем уведомление о приёмке товара
    await notificationService.send({
      type: NotificationType.PO_RECEIVED,
      data: {
        poNumber: po.poNumber,
        itemsReceived: result.itemsReceived,
        receivedBy: req.user!.username,
      }
    });

    logger.info('PO items received', { id, itemsCount: items.length, photoUrl, by: req.user?.username });
    res.status(201).json(result);
  } catch (error) {
    logger.error('Failed to receive PO items', { error });
    res.status(500).json({ error: 'Failed to receive PO items' });
  }
});

// POST /api/procurement/purchase-orders/:id/close - Закрыть PO
router.post('/:id/close', authenticateToken, async (req, res) => {
  try {
    if (!canManageProcurement(req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;

    const po = await prisma.purchaseOrder.findUnique({
      where: { id }
    });

    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    if (po.status === 'CLOSED') {
      return res.status(400).json({ error: 'PO already closed' });
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: { 
        status: 'CLOSED',
        closedAt: new Date()
      }
    });

    logger.info('PO closed', { id, by: req.user?.username });
    res.json(updated);
  } catch (error) {
    logger.error('Failed to close PO', { error });
    res.status(500).json({ error: 'Failed to close PO' });
  }
});

export default router;

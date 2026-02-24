import express from 'express';
import { authenticateToken, ROLES } from '../../shared/middleware/auth';
import { prisma } from '../../db';
import { logger } from '../../shared/utils/logger';
import ExcelJS from 'exceljs';

const router = express.Router();

// GET /api/reports/stock - Отчёт по остаткам
router.get('/stock', authenticateToken, async (req, res) => {
  try {
    const user = req.user!;
    const { locationId } = req.query;

    let where: any = {};
    
    // SUPERVISOR - только свои локации
    if (user.role === ROLES.SUPERVISOR) {
      const assignments = await prisma.supervisorLocation.findMany({
        where: { supervisorId: user.username },
        select: { locationId: true }
      });
      
      const locationIds = assignments.map(a => a.locationId);
      where.locationId = { in: locationIds };
    } else if (locationId) {
      where.locationId = locationId;
    }

    const stockItems = await prisma.stockItem.findMany({
      where,
      include: {
        location: true,
        product: {
          include: { category: true }
        }
      },
      orderBy: [
        { location: { name: 'asc' } },
        { product: { category: { name: 'asc' } } },
        { product: { name: 'asc' } }
      ]
    });

    res.json(stockItems);
  } catch (error) {
    logger.error('Failed to fetch stock report', { error });
    res.status(500).json({ error: 'Failed to fetch stock report' });
  }
});

// GET /api/reports/consumption - Отчёт по расходу (IssueRecords за период)
router.get('/consumption', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, locationId } = req.query;

    let where: any = {};
    
    if (startDate && endDate) {
      where.issuedAt = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

    if (locationId) {
      where.request = {
        locationId: locationId as string
      };
    }

    const issues = await prisma.issueRecord.findMany({
      where,
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
        }
      },
      orderBy: { issuedAt: 'desc' }
    });

    res.json(issues);
  } catch (error) {
    logger.error('Failed to fetch consumption report', { error });
    res.status(500).json({ error: 'Failed to fetch consumption report' });
  }
});

// GET /api/reports/purchases - Отчёт по закупкам (PO за период)
router.get('/purchases', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, supplierId, status } = req.query;

    let where: any = {};

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status;

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
    logger.error('Failed to fetch purchases report', { error });
    res.status(500).json({ error: 'Failed to fetch purchases report' });
  }
});

// GET /api/reports/requests - Отчёт по запросам (Requests за период)
router.get('/requests', authenticateToken, async (req, res) => {
  try {
    const user = req.user!;
    const { startDate, endDate, locationId, status } = req.query;

    let where: any = {};

    // SUPERVISOR - только свои
    if (user.role === ROLES.SUPERVISOR) {
      where.createdBy = user.username;
    }

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

    if (locationId) where.locationId = locationId;
    if (status) where.status = status;

    const requests = await prisma.request.findMany({
      where,
      include: {
        location: true,
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
    logger.error('Failed to fetch requests report', { error });
    res.status(500).json({ error: 'Failed to fetch requests report' });
  }
});

// GET /api/reports/stock/export - Экспорт остатков в Excel
router.get('/stock/export', authenticateToken, async (req, res) => {
  try {
    const user = req.user!;
    const { locationId } = req.query;

    let where: any = {};
    
    if (user.role === ROLES.SUPERVISOR) {
      const assignments = await prisma.supervisorLocation.findMany({
        where: { supervisorId: user.username },
        select: { locationId: true }
      });
      
      const locationIds = assignments.map(a => a.locationId);
      where.locationId = { in: locationIds };
    } else if (locationId) {
      where.locationId = locationId;
    }

    const stockItems = await prisma.stockItem.findMany({
      where,
      include: {
        location: true,
        product: {
          include: { category: true }
        }
      },
      orderBy: [
        { location: { name: 'asc' } },
        { product: { name: 'asc' } }
      ]
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Stock Report');

    worksheet.columns = [
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Product', key: 'product', width: 30 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Quantity', key: 'quantity', width: 12 },
      { header: 'Limit', key: 'limitQty', width: 12 }
    ];

    stockItems.forEach(item => {
      worksheet.addRow({
        location: item.location.name,
        category: item.product.category.name,
        product: item.product.name,
        unit: item.product.unit,
        quantity: item.quantity,
        limitQty: item.limitQty ?? '-'
      });
    });

    worksheet.getRow(1).font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="stock-report-${new Date().toISOString().split('T')[0]}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();

    logger.info('Stock report exported', { by: user.username });
  } catch (error) {
    logger.error('Failed to export stock report', { error });
    res.status(500).json({ error: 'Failed to export stock report' });
  }
});

// GET /api/reports/consumption/export - Экспорт расхода в Excel
router.get('/consumption/export', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, locationId } = req.query;

    let where: any = {};
    
    if (startDate && endDate) {
      where.issuedAt = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

    if (locationId) {
      where.request = {
        locationId: locationId as string
      };
    }

    const issues = await prisma.issueRecord.findMany({
      where,
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
        }
      },
      orderBy: { issuedAt: 'asc' }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Consumption Report');

    worksheet.columns = [
      { header: 'Date', key: 'date', width: 20 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Request ID', key: 'requestId', width: 15 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Product', key: 'product', width: 30 },
      { header: 'Quantity', key: 'quantity', width: 12 },
      { header: 'Issued By', key: 'issuedBy', width: 15 }
    ];

    issues.forEach(issue => {
      issue.request.items.forEach(item => {
        worksheet.addRow({
          date: issue.issuedAt.toISOString().split('T')[0],
          location: issue.request.location.name,
          requestId: issue.requestId,
          category: item.product.category.name,
          product: item.product.name,
          quantity: item.issued,
          issuedBy: issue.issuedBy
        });
      });
    });

    worksheet.getRow(1).font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="consumption-report-${new Date().toISOString().split('T')[0]}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();

    logger.info('Consumption report exported', { by: req.user?.username });
  } catch (error) {
    logger.error('Failed to export consumption report', { error });
    res.status(500).json({ error: 'Failed to export consumption report' });
  }
});

// GET /api/reports/purchases/export - Экспорт закупок в Excel
router.get('/purchases/export', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, supplierId } = req.query;

    let where: any = {};

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

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
      orderBy: { createdAt: 'asc' }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Purchases Report');

    worksheet.columns = [
      { header: 'Date', key: 'date', width: 20 },
      { header: 'PO ID', key: 'poId', width: 15 },
      { header: 'Supplier', key: 'supplier', width: 25 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Product', key: 'product', width: 30 },
      { header: 'Quantity', key: 'quantity', width: 12 },
      { header: 'Unit Price', key: 'unitPrice', width: 12 },
      { header: 'Total', key: 'total', width: 12 },
      { header: 'Status', key: 'status', width: 15 }
    ];

    orders.forEach(order => {
      order.items.forEach(item => {
        worksheet.addRow({
          date: order.createdAt.toISOString().split('T')[0],
          poId: order.id,
          supplier: order.supplier.name,
          category: item.product.category.name,
          product: item.product.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.quantity * item.unitPrice,
          status: order.status
        });
      });
    });

    worksheet.getRow(1).font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="purchases-report-${new Date().toISOString().split('T')[0]}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();

    logger.info('Purchases report exported', { by: req.user?.username });
  } catch (error) {
    logger.error('Failed to export purchases report', { error });
    res.status(500).json({ error: 'Failed to export purchases report' });
  }
});

export default router;

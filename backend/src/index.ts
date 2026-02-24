import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import multer from 'multer';
import { prisma } from './db';
import { logger } from './shared/utils/logger';

dotenv.config();

// Импорт роутов
import authRoutes from './modules/auth/routes';
import productsRoutes from './modules/products/routes';
import categoriesRoutes from './modules/products/categoriesRoutes';
import suppliersRoutes from './modules/suppliers/routes';
import locationsRoutes from './modules/locations/routes';
import stockRoutes from './modules/stock/routes';
import requestsRoutes from './modules/warehouse/requestsRoutes';
import issueRoutes from './modules/warehouse/issueRoutes';
import inventoryRoutes from './modules/warehouse/inventoryRoutes';
import purchaseRequestsRoutes from './modules/procurement/purchaseRequestsRoutes';
import purchaseOrdersRoutes from './modules/procurement/purchaseOrdersRoutes';
import reportsRoutes from './modules/reports/routes';

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests',
});
app.use('/api/', limiter);

// Health check (публичный)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mintstock-backend', version: '1.0.0' });
});

// Static uploads (доступны через /uploads/ и /api/uploads/)
const uploadsPath = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsPath));
app.use('/api/uploads', express.static(uploadsPath));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/warehouse/requests', requestsRoutes);
app.use('/api/warehouse/issues', issueRoutes);
app.use('/api/warehouse/inventory', inventoryRoutes);
app.use('/api/procurement/purchase-requests', purchaseRequestsRoutes);
app.use('/api/procurement/purchase-orders', purchaseOrdersRoutes);
app.use('/api/reports', reportsRoutes);

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  logger.info(`MintStock Backend running on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

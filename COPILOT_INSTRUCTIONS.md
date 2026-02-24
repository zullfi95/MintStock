# MintStock — Инструкции для GitHub Copilot

**Версия плана**: 1.7
**Роль Copilot**: Реализация всего кода по точным спецификациям ниже.
**Роль Claude**: Архитектура, проверка после каждого шага.

> ⚠️ **ВАЖНО**: Не отступай от спецификаций. Не добавляй функции которых нет в плане. Если что-то неясно — пиши TODO-комментарий, не придумывай.

---

## КОНТЕКСТ ПРОЕКТА

**MintStock** — модуль управления складом и закупками для клининговой компании.
Часть портала **MintStudio** (`wtm.az`).
Структура компании: **Центральный склад (ЦС)** + несколько **Объектов** (филиалы).

**Бизнес-флоу:**
```
Супервайзор объекта
  → создаёт Request (запрос на пополнение)
      → Складовщик проверяет ЦС
          ├── Есть товар → выдаёт (IssueRecord), обновляет StockItem
          └── Нет товара → создаёт PurchaseRequest (запрос на закупку)
                              → Закупщик создаёт PurchaseOrder (PO → PDF)
                                  → отправляет поставщику (Email / Telegram)
                                      → Складовщик принимает товар (ReceiveRecord + фото)
                                          → выдаёт на объект
```

**Технический стек:**
- Backend: Node.js 20 + Express + TypeScript + Prisma + PostgreSQL
- Frontend: React + Vite + TypeScript + Tailwind CSS
- Auth: JWT через MintAuth (cookie `mint_session`)
- PDF: `pdfkit`
- Telegram: `node-telegram-bot-api` (тот же бот что в FeedbackQR)
- Email: `nodemailer`

---

## ШАГ 0 — ИЗМЕНЕНИЯ В ОБЩИХ ФАЙЛАХ ПОРТАЛА

> Эти изменения в существующих файлах MintStudio, не в папке MintStock.

### 0.1 `E:\MintStudio\scripts\db\init-multiple-databases.sh`

Добавить в конец блока SQL (перед `EOSQL`) три строки по аналогии с существующими:

```bash
    CREATE USER mintstock WITH PASSWORD '${MINTSTOCK_DB_PASSWORD}';
    CREATE DATABASE mintstock_db OWNER mintstock;
    GRANT ALL PRIVILEGES ON DATABASE mintstock_db TO mintstock;
```

И добавить в `.env` (корень проекта):
```env
MINTSTOCK_DB_PASSWORD=<сгенерировать_32_символа>
MINTSTOCK_DATABASE_URL=postgresql://mintstock:${MINTSTOCK_DB_PASSWORD}@postgres:5432/mintstock_db
```

---

### 0.2 `E:\MintStudio\docker-compose.all.yml`

Добавить два сервиса после блока `feedbackatm-frontend:`.
**Точный шаблон** (скопировать с feedbackatm, заменить имена):

```yaml
  mintstock-backend:
    build: ./MintStock/backend
    container_name: mintstock-backend
    volumes:
      - ./MintStock/backend/src:/app/src
      - ./MintStock/backend/package.json:/app/package.json
      - ./MintStock/backend/package-lock.json:/app/package-lock.json
      - ./MintStock/backend/tsconfig.json:/app/tsconfig.json
      - mintstock_uploads:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      - DATABASE_URL=${MINTSTOCK_DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET_KEY}
      - MINTAUTH_URL=http://mintauth-backend:8000
      - PORT=3003
      - NODE_ENV=production
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_PORT=${SMTP_PORT}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
      - UPLOAD_DIR=/app/uploads
      - FRONTEND_URL=https://wtm.az/mintstock
    networks:
      - mintstudio_network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  mintstock-frontend:
    build:
      context: .
      dockerfile: MintStock/frontend/Dockerfile
    container_name: mintstock-frontend
    volumes:
      - ./MintStock/frontend/src:/app/src
      - ./MintStock/frontend/index.html:/app/index.html
      - ./MintStock/frontend/vite.config.ts:/app/vite.config.ts
      - ./MintStock/frontend/tailwind.config.js:/app/tailwind.config.js
      - ./MintStock/frontend/postcss.config.js:/app/postcss.config.js
      - ./MintStock/frontend/package.json:/app/package.json
      - ./MintStock/frontend/package-lock.json:/app/package-lock.json
      - ./MintStock/frontend/tsconfig.json:/app/tsconfig.json
      - ./MintStock/frontend/tsconfig.node.json:/app/tsconfig.node.json
      - ./shared-components:/app/shared-components
      - mintstock_frontend_node_modules:/app/node_modules
    depends_on:
      - mintstock-backend
    environment:
      - NODE_ENV=production
    networks:
      - mintstudio_network
    restart: unless-stopped
```

В секцию `volumes:` добавить:
```yaml
  mintstock_uploads:
  mintstock_frontend_node_modules:
```

---

### 0.3 `E:\MintStudio\nginx-portal.conf`

**А) В блок upstreams** (после `feedbackatm_frontend`) добавить:

```nginx
upstream mintstock_backend {
    server mintstock-backend:3003;
}

upstream mintstock_frontend {
    server mintstock-frontend:80;
}
```

**Б) В блок server (HTTPS)** добавить location-блоки после feedbackatm секции:

```nginx
# ── MintStock ────────────────────────────────────────────────

location /mintstock/assets/ {
    proxy_pass http://mintstock_frontend/assets/;
    proxy_set_header Host $host;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header Pragma "no-cache";
    add_header Expires "0";
}

location ~ ^/mintstock/(login|auth/login)$ {
    return 302 /mintauth/auth/login?redirect=/mintstock/;
}

location = /mintstock/api/auth/login {
    if ($request_method = 'OPTIONS') {
        add_header Access-Control-Allow-Origin $allowed_origin always;
        add_header Access-Control-Allow-Methods "POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type" always;
        add_header Access-Control-Allow-Credentials true always;
        return 204;
    }
    rewrite ^/mintstock/api/auth/login$ /api/auth/login break;
    proxy_pass http://mintstock_backend;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    add_header Access-Control-Allow-Origin $allowed_origin always;
    add_header Access-Control-Allow-Credentials true always;
}

location = /mintstock/api/auth/verify {
    proxy_pass http://mintstock_backend/api/auth/verify;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Cookie $http_cookie;
    proxy_set_header Authorization $http_authorization;
    add_header Access-Control-Allow-Origin $allowed_origin always;
    add_header Access-Control-Allow-Credentials true always;
}

location = /mintstock/api/auth/me {
    proxy_pass http://mintstock_backend/api/auth/me;
    proxy_set_header Host $host;
    proxy_set_header Cookie $http_cookie;
    proxy_set_header Authorization $http_authorization;
    add_header Access-Control-Allow-Origin $allowed_origin always;
    add_header Access-Control-Allow-Credentials true always;
}

# Uploads — через backend (не alias!)
location /mintstock/uploads/ {
    auth_request /mintauth/auth/verify;
    rewrite ^/mintstock/uploads/(.*)$ /uploads/$1 break;
    proxy_pass http://mintstock_backend;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Cookie $http_cookie;
}

# Все остальные API — защищены MintAuth
location /mintstock/api/ {
    auth_request /mintauth/auth/verify;
    rewrite ^/mintstock/api/(.*)$ /api/$1 break;
    proxy_pass http://mintstock_backend;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Cookie $http_cookie;
    proxy_set_header Authorization $http_authorization;
    error_page 401 =401 @auth_error_json;
}

# Frontend — защищён MintAuth
location /mintstock/ {
    auth_request /mintauth/auth/verify;
    proxy_pass http://mintstock_frontend;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header Pragma "no-cache" always;
    add_header Expires "0" always;
    error_page 401 =401 @auth_error;
}
```

---

### 0.4 `E:\MintStudio\portal-index.html`

Найти блок с карточками систем (div с классом `system-card` для feedbackatm).
Добавить после него карточку MintStock по тому же шаблону:

```html
<div class="system-card" data-system="mintstock" data-name="MintStock">
  <div class="system-icon">📦</div>
  <h3>MintStock</h3>
  <p>Склад и закупки</p>
</div>
```

### 0.5 `E:\MintStudio\portal.js`

В объект `systemUrls` добавить:
```js
mintstock: API_BASE + '/mintstock/',
```

В объект `projectNameToSystem` добавить:
```js
'MintStock': 'mintstock',
```

---

## ШАГ 1 — BACKEND: ИНИЦИАЛИЗАЦИЯ

### 1.1 `MintStock/backend/package.json`

```json
{
  "name": "mintstock-backend",
  "version": "1.0.0",
  "description": "Backend for MintStock — Warehouse & Procurement module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio",
    "db:seed": "tsx src/scripts/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.7.1",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "node-telegram-bot-api": "^0.66.0",
    "nodemailer": "^6.9.7",
    "pdfkit": "^0.17.2",
    "winston": "^3.11.0",
    "exceljs": "^4.4.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/multer": "^1.4.11",
    "@types/node": "^20.10.5",
    "@types/node-telegram-bot-api": "^0.64.11",
    "@types/nodemailer": "^6.4.14",
    "@types/pdfkit": "^0.13.4",
    "prisma": "^5.7.1",
    "tsx": "^4.6.2",
    "typescript": "^5.3.3"
  }
}
```

---

### 1.2 `MintStock/backend/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

### 1.3 `MintStock/backend/Dockerfile`

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

# Установить шрифты для pdfkit (PDF генерация)
RUN apk add --no-cache fontconfig ttf-dejavu

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# Production image
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache fontconfig ttf-dejavu curl

COPY package*.json ./
RUN npm ci --only=production

COPY prisma ./prisma/
RUN npx prisma generate

COPY --from=builder /app/dist ./dist/

RUN mkdir -p /app/uploads

EXPOSE 3003
CMD ["node", "dist/index.js"]
```

---

### 1.4 `MintStock/backend/.env.example`

```env
# Database
DATABASE_URL=postgresql://mintstock:password@postgres:5432/mintstock_db

# Auth (same secret as all other services!)
JWT_SECRET=same_as_other_services

# MintAuth
MINTAUTH_URL=http://mintauth-backend:8000

# Server
PORT=3003
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Telegram (same bot as FeedbackQR)
TELEGRAM_BOT_TOKEN=

# SMTP
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=

# Uploads
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
```

---

## ШАГ 2 — BACKEND: PRISMA SCHEMA

### 2.1 `MintStock/backend/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── ТОВАРЫ ──────────────────────────────────────────────────

model Product {
  id         String   @id @default(cuid())
  name       String
  categoryId String
  unit       String   // шт, л, кг, упак, рулон
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  category             Category              @relation(fields: [categoryId], references: [id])
  stockItems           StockItem[]
  requestItems         RequestItem[]
  purchaseRequestItems PurchaseRequestItem[]
  poItems              PurchaseOrderItem[]
  supplierPrices       SupplierPrice[]
  inventoryItems       InventoryItem[]

  @@map("products")
}

model Category {
  id        String    @id @default(cuid())
  name      String    @unique
  createdAt DateTime  @default(now())

  products  Product[]

  @@map("categories")
}

// ─── ПОСТАВЩИКИ ──────────────────────────────────────────────

model Supplier {
  id         String   @id @default(cuid())
  name       String
  contact    String   // Контактное лицо
  phone      String?
  email      String?
  telegramId String?  // chat_id (поставщик должен написать боту первым)
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  purchaseOrders PurchaseOrder[]
  supplierPrices SupplierPrice[]

  @@map("suppliers")
}

// Цена товара у конкретного поставщика
model SupplierPrice {
  id         String   @id @default(cuid())
  supplierId String
  productId  String
  price      Float    // Цена в манатах (₼)
  updatedAt  DateTime @updatedAt

  supplier   Supplier @relation(fields: [supplierId], references: [id])
  product    Product  @relation(fields: [productId], references: [id])

  @@unique([supplierId, productId])
  @@map("supplier_prices")
}

// ─── ЛОКАЦИИ (ЦС + ОБЪЕКТЫ) ──────────────────────────────────

model Location {
  id        String       @id @default(cuid())
  name      String
  type      LocationType // WAREHOUSE (ЦС) | SITE (объект)
  address   String?
  isActive  Boolean      @default(true)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  stockItems          StockItem[]
  requests            Request[]
  supervisorLocations SupervisorLocation[]
  inventories         Inventory[]

  @@map("locations")
}

enum LocationType {
  WAREHOUSE
  SITE
}

// Привязка супервайзора к объекту (один супервайзор → несколько объектов)
model SupervisorLocation {
  id           String   @id @default(cuid())
  supervisorId String   // username из MintAuth
  locationId   String
  assignedAt   DateTime @default(now())

  location     Location @relation(fields: [locationId], references: [id])

  @@unique([supervisorId, locationId])
  @@map("supervisor_locations")
}

// ─── ОСТАТКИ ─────────────────────────────────────────────────

// Текущие остатки товара на локации (ЦС или объект)
model StockItem {
  id         String   @id @default(cuid())
  productId  String
  locationId String
  quantity   Int      @default(0)
  limitQty   Int?     // Месячный лимит по количеству (только для SITE)
  updatedAt  DateTime @updatedAt

  product    Product  @relation(fields: [productId], references: [id])
  location   Location @relation(fields: [locationId], references: [id])

  @@unique([productId, locationId])
  @@map("stock_items")
}

// ─── ЗАПРОСЫ НА ПОПОЛНЕНИЕ (Супервайзор → Складовщик) ────────

model Request {
  id         String        @id @default(cuid())
  locationId String        // Объект который запрашивает
  status     RequestStatus @default(PENDING)
  createdBy  String        // username из MintAuth (Супервайзор)
  note       String?
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt

  location    Location      @relation(fields: [locationId], references: [id])
  items       RequestItem[]
  issueRecords IssueRecord[]

  @@map("requests")
}

model RequestItem {
  id        String  @id @default(cuid())
  requestId String
  productId String
  quantity  Int     // Запрошено
  issued    Int     @default(0) // Выдано (для частичной выдачи)

  request   Request @relation(fields: [requestId], references: [id], onDelete: Cascade)
  product   Product @relation(fields: [productId], references: [id])

  @@map("request_items")
}

enum RequestStatus {
  PENDING    // Ожидает обработки складовщиком
  APPROVED   // Принят в работу
  PARTIAL    // Частично выдан
  FULFILLED  // Полностью выдан
  REJECTED   // Отклонён
}

// Запись о выдаче товара со склада на объект
model IssueRecord {
  id        String   @id @default(cuid())
  requestId String
  productId String
  quantity  Int      // Выдано
  issuedBy  String   // username из MintAuth (Складовщик)
  issuedAt  DateTime @default(now())
  note      String?

  request   Request  @relation(fields: [requestId], references: [id])

  @@map("issue_records")
}

// ─── ЗАПРОСЫ НА ЗАКУПКУ (Складовщик → Закупщик) ─────────────

model PurchaseRequest {
  id        String                @id @default(cuid())
  status    PurchaseRequestStatus @default(PENDING)
  createdBy String                // username из MintAuth (Складовщик)
  note      String?
  createdAt DateTime              @default(now())
  updatedAt DateTime              @updatedAt

  items     PurchaseRequestItem[]
  po        PurchaseOrder?        @relation(fields: [poId], references: [id])
  poId      String?               // Ссылка на PO когда создана

  @@map("purchase_requests")
}

enum PurchaseRequestStatus {
  PENDING      // Ожидает обработки закупщиком
  IN_PROGRESS  // Закупщик работает над PO
  DONE         // PO создана
}

model PurchaseRequestItem {
  id                String          @id @default(cuid())
  purchaseRequestId String
  productId         String
  quantity          Int             // Сколько нужно докупить

  purchaseRequest   PurchaseRequest @relation(fields: [purchaseRequestId], references: [id], onDelete: Cascade)
  product           Product         @relation(fields: [productId], references: [id])

  @@map("purchase_request_items")
}

// ─── PURCHASE ORDERS (PO) ─────────────────────────────────────

model PurchaseOrder {
  id          String     @id @default(cuid())
  poNumber    String     @unique  // PO-2026-0001
  supplierId  String
  status      POStatus   @default(DRAFT)
  totalAmount Float      @default(0)
  createdBy   String     // username из MintAuth (Закупщик)
  deliveryDate DateTime? // Ожидаемая дата доставки
  note        String?
  createdAt   DateTime   @default(now())
  sentAt      DateTime?
  receivedAt  DateTime?
  closedAt    DateTime?

  supplier        Supplier              @relation(fields: [supplierId], references: [id])
  items           PurchaseOrderItem[]
  receiveRecords  ReceiveRecord[]
  purchaseRequests PurchaseRequest[]   // Какие purchase requests покрывает этот PO

  @@map("purchase_orders")
}

enum POStatus {
  DRAFT     // Черновик (создан, не отправлен)
  SENT      // Отправлен поставщику
  RECEIVED  // Товар принят на ЦС
  CLOSED    // Закрыт
}

model PurchaseOrderItem {
  id          String  @id @default(cuid())
  poId        String
  productId   String
  quantity    Int     // Заказано
  receivedQty Int     @default(0) // Реально принято (частичные поставки)
  unitPrice   Float   // Цена за единицу (₼)
  totalPrice  Float   // quantity * unitPrice

  po          PurchaseOrder @relation(fields: [poId], references: [id], onDelete: Cascade)
  product     Product       @relation(fields: [productId], references: [id])

  @@map("purchase_order_items")
}

// Запись о приёмке товара по PO (Складовщик)
model ReceiveRecord {
  id         String   @id @default(cuid())
  poId       String
  receivedBy String   // username из MintAuth (Складовщик)
  photoUrl   String?  // Фото накладной или товара
  note       String?
  receivedAt DateTime @default(now())

  po         PurchaseOrder @relation(fields: [poId], references: [id])

  @@map("receive_records")
}

// ─── ИНВЕНТАРИЗАЦИЯ ──────────────────────────────────────────

model Inventory {
  id          String          @id @default(cuid())
  locationId  String
  status      InventoryStatus @default(IN_PROGRESS)
  conductedBy String          // username из MintAuth
  startedAt   DateTime        @default(now())
  closedAt    DateTime?
  note        String?

  location    Location        @relation(fields: [locationId], references: [id])
  items       InventoryItem[]

  @@map("inventories")
}

enum InventoryStatus {
  IN_PROGRESS
  COMPLETED
}

model InventoryItem {
  id          String    @id @default(cuid())
  inventoryId String
  productId   String
  systemQty   Int       // Кол-во в системе (до инвентаризации)
  actualQty   Int       // Фактическое кол-во (введено вручную)
  difference  Int       // actualQty - systemQty (может быть отрицательным)

  inventory   Inventory @relation(fields: [inventoryId], references: [id], onDelete: Cascade)
  product     Product   @relation(fields: [productId], references: [id])

  @@map("inventory_items")
}
```

---

## ШАГ 3 — BACKEND: CORE FILES

### 3.1 `MintStock/backend/src/db.ts`

```typescript
import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
```

---

### 3.2 `MintStock/backend/src/shared/utils/logger.ts`

```typescript
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'mintstock-backend' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});
```

---

### 3.3 `MintStock/backend/src/shared/middleware/auth.ts`

> Скопировать паттерн из `FeedbackATM/backend/src/middleware/auth.ts` с адаптацией для MintStock.

**Ключевые отличия от FeedbackATM:**
- Проект называется `"MintStock"` при поиске в `data.projects`
- Роли MintStock: `ADMIN`, `OPERATIONS_MANAGER`, `WAREHOUSE_MANAGER`, `PROCUREMENT`, `SUPERVISOR`
- `req.user` не содержит `companyId` (не нужен в MintStock)

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../../db';

// Роли MintStock
export const ROLES = {
  ADMIN: 'ADMIN',
  OPERATIONS_MANAGER: 'OPERATIONS_MANAGER',
  WAREHOUSE_MANAGER: 'WAREHOUSE_MANAGER',
  PROCUREMENT: 'PROCUREMENT',
  SUPERVISOR: 'SUPERVISOR',
} as const;

export type UserRole = typeof ROLES[keyof typeof ROLES];

declare global {
  namespace Express {
    interface Request {
      user?: {
        username: string;
        role: UserRole;
      };
    }
  }
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  let token: string | null = null;

  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token && req.headers.cookie) {
    const cookies = Object.fromEntries(
      req.headers.cookie.split(';').map(c => {
        const [k, ...v] = c.trim().split('=');
        return [k, v.join('=')];
      })
    );
    token = cookies['mint_session'] ?? null;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as any;
    if (decoded.type && decoded.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const username = decoded.sub || decoded.username;
    if (!username) {
      return res.status(403).json({ error: 'Invalid token: no username' });
    }

    // Получаем роль из MintAuth
    let role: UserRole = ROLES.SUPERVISOR;
    const mintauthUrl = process.env.MINTAUTH_URL || 'http://mintauth-backend:8000';

    try {
      const response = await fetch(`${mintauthUrl}/auth/user-projects?username=${encodeURIComponent(username)}`);
      if (response.ok) {
        const data = await response.json() as {
          is_admin?: boolean;
          projects?: Array<{ project_name: string; role: string }>;
        };
        if (data.is_admin) {
          role = ROLES.ADMIN;
        } else {
          const project = data.projects?.find(p => p.project_name === 'MintStock');
          if (project?.role && Object.values(ROLES).includes(project.role as UserRole)) {
            role = project.role as UserRole;
          }
        }
      }
    } catch {
      // MintAuth недоступен — продолжаем с дефолтной ролью
    }

    req.user = { username, role };
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Middleware для проверки ролей
export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
};

// Хелперы для проверки ролей
export const isAdmin = (role: UserRole) => role === ROLES.ADMIN;
export const isAdminOrOM = (role: UserRole) => [ROLES.ADMIN, ROLES.OPERATIONS_MANAGER].includes(role);
export const canManageWarehouse = (role: UserRole) =>
  [ROLES.ADMIN, ROLES.OPERATIONS_MANAGER, ROLES.WAREHOUSE_MANAGER].includes(role);
export const canManageProcurement = (role: UserRole) =>
  [ROLES.ADMIN, ROLES.OPERATIONS_MANAGER, ROLES.PROCUREMENT].includes(role);
```

---

### 3.4 `MintStock/backend/src/index.ts`

```typescript
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
app.use('/api/procurement/po', purchaseOrdersRoutes);
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
```

---

## ШАГ 4 — BACKEND: МОДУЛИ

> Для каждого модуля создать папку `src/modules/<имя>/` с файлами `routes.ts`, `controller.ts`, `service.ts`.

---

### 4.1 Модуль `auth`

**`src/modules/auth/routes.ts`**

Маршруты:
- `GET /api/auth/me` — возвращает `{ username, role }` из `req.user` (использует `authenticateToken`)
- `POST /api/auth/verify` — то же самое (для совместимости с Nginx `auth_request`)

---

### 4.2 Модуль `products`

**`src/modules/products/routes.ts`**

| Метод | Путь | Роли | Описание |
|---|---|---|---|
| GET | `/api/products` | Все | Список товаров (фильтр: categoryId, isActive) |
| POST | `/api/products` | ADMIN | Создать товар |
| PUT | `/api/products/:id` | ADMIN | Редактировать товар |
| PATCH | `/api/products/:id/toggle` | ADMIN | Включить/выключить товар |
| POST | `/api/products/import` | ADMIN | Импорт из Excel (поле: файл `file`, multer) |

**Формат Excel для импорта товаров:**
```
Колонка A: name (название)
Колонка B: category (название категории — будет создана если нет)
Колонка C: unit (ед. изм.)
```

**`src/modules/products/categoriesRoutes.ts`**

| Метод | Путь | Роли | Описание |
|---|---|---|---|
| GET | `/api/categories` | Все | Список категорий |
| POST | `/api/categories` | ADMIN | Создать категорию |
| PUT | `/api/categories/:id` | ADMIN | Редактировать категорию |

---

### 4.3 Модуль `suppliers`

**`src/modules/suppliers/routes.ts`**

| Метод | Путь | Роли | Описание |
|---|---|---|---|
| GET | `/api/suppliers` | Все кроме SUPERVISOR | Список поставщиков |
| POST | `/api/suppliers` | ADMIN, OPERATIONS_MANAGER | Создать поставщика |
| PUT | `/api/suppliers/:id` | ADMIN, OPERATIONS_MANAGER | Редактировать |
| PATCH | `/api/suppliers/:id/toggle` | ADMIN | Вкл/выкл |
| GET | `/api/suppliers/:id/prices` | Все кроме SUPERVISOR | Цены поставщика |
| POST | `/api/suppliers/:id/prices` | ADMIN, OPERATIONS_MANAGER, PROCUREMENT | Установить цену товара |

---

### 4.4 Модуль `locations`

**`src/modules/locations/routes.ts`**

| Метод | Путь | Роли | Описание |
|---|---|---|---|
| GET | `/api/locations` | Все | Список локаций (фильтр: type=WAREHOUSE/SITE) |
| POST | `/api/locations` | ADMIN | Создать локацию |
| PUT | `/api/locations/:id` | ADMIN | Редактировать |
| GET | `/api/locations/:id/supervisors` | ADMIN | Супервайзоры объекта |
| POST | `/api/locations/:id/supervisors` | ADMIN | Привязать супервайзора (body: `{ username }`) |
| DELETE | `/api/locations/:id/supervisors/:username` | ADMIN | Отвязать супервайзора |
| GET | `/api/locations/my` | SUPERVISOR | Свои объекты (берёт из SupervisorLocation по username) |

---

### 4.5 Модуль `stock`

**`src/modules/stock/routes.ts`**

| Метод | Путь | Роли | Описание |
|---|---|---|---|
| GET | `/api/stock` | Все (SUPERVISOR — только свои) | Остатки (фильтр: locationId) |
| GET | `/api/stock/low` | ADMIN, OM, WAREHOUSE | Товары с нулевым/низким остатком |
| PUT | `/api/stock/initial` | ADMIN | Установить начальные остатки (bulk, из Excel) |
| PUT | `/api/stock/limits` | ADMIN | Установить лимиты на объектах (bulk) |

**Логика прав на `GET /api/stock`:**
- SUPERVISOR — только локации из `SupervisorLocation` по его `username`
- Остальные — все локации

---

### 4.6 Модуль `warehouse` — Requests

**`src/modules/warehouse/requestsRoutes.ts`**

| Метод | Путь | Роли | Описание |
|---|---|---|---|
| GET | `/api/warehouse/requests` | SUPERVISOR (свои), остальные (все) | Список запросов |
| POST | `/api/warehouse/requests` | SUPERVISOR | Создать запрос на пополнение |
| GET | `/api/warehouse/requests/:id` | Все | Детали запроса |
| PATCH | `/api/warehouse/requests/:id/status` | WAREHOUSE, OM, ADMIN | Изменить статус (APPROVED/REJECTED) |
| GET | `/api/warehouse/requests/:id/autofill` | SUPERVISOR | Авто-расчёт до лимита |

**Логика авто-расчёта** (`GET /autofill`):
```
Для каждого товара объекта:
  нужно = limitQty - текущий остаток StockItem для этого (productId, locationId)
  если нужно < 0 → 0
Вернуть массив { productId, quantity: нужно }
```

---

### 4.7 Модуль `warehouse` — Issue (Выдача)

**`src/modules/warehouse/issueRoutes.ts`**

| Метод | Путь | Роли | Описание |
|---|---|---|---|
| POST | `/api/warehouse/issues` | WAREHOUSE, OM, ADMIN | Выдать товар по запросу |

**Body запроса:**
```json
{
  "requestId": "...",
  "items": [
    { "productId": "...", "quantity": 5 }
  ],
  "note": "..."
}
```

**Логика выдачи:**
1. Проверить что товар есть на ЦС (`StockItem` для WAREHOUSE-локации)
2. Создать `IssueRecord` для каждого товара
3. Уменьшить `StockItem.quantity` на ЦС
4. Увеличить `StockItem.quantity` на объекте (создать если не существует)
5. Обновить `RequestItem.issued`
6. Пересчитать статус `Request`:
   - Если все `issued >= quantity` → `FULFILLED`
   - Иначе если `issued > 0` → `PARTIAL`

---

### 4.8 Модуль `warehouse` — Inventory (Инвентаризация)

**`src/modules/warehouse/inventoryRoutes.ts`**

| Метод | Путь | Роли | Описание |
|---|---|---|---|
| GET | `/api/warehouse/inventory` | Все | Список инвентаризаций (фильтр: locationId, status) |
| POST | `/api/warehouse/inventory` | WAREHOUSE, SUPERVISOR, OM, ADMIN | Начать инвентаризацию |
| GET | `/api/warehouse/inventory/:id` | Все | Детали |
| PUT | `/api/warehouse/inventory/:id/items` | Тот кто создал | Ввести фактические остатки |
| POST | `/api/warehouse/inventory/:id/close` | Тот кто создал или ADMIN | Закрыть инвентаризацию |

**Логика начала инвентаризации** (`POST`):
- Проверить что нет активной (status=IN_PROGRESS) для этой локации
- Создать `Inventory` с `status=IN_PROGRESS`
- Автоматически создать `InventoryItem` для каждого товара на этой локации (из `StockItem`), заполнив `systemQty = StockItem.quantity`, `actualQty = 0`, `difference = 0`

**Логика закрытия** (`POST /close`):
1. Для каждого `InventoryItem` обновить `difference = actualQty - systemQty`
2. Обновить `StockItem.quantity = actualQty` для каждого товара
3. Установить `Inventory.status = COMPLETED`, `closedAt = now()`

---

### 4.9 Модуль `procurement` — PurchaseRequests

**`src/modules/procurement/purchaseRequestsRoutes.ts`**

| Метод | Путь | Роли | Описание |
|---|---|---|---|
| GET | `/api/procurement/purchase-requests` | WAREHOUSE, PROCUREMENT, OM, ADMIN | Список |
| POST | `/api/procurement/purchase-requests` | WAREHOUSE, OM, ADMIN | Создать запрос на закупку |
| GET | `/api/procurement/purchase-requests/:id` | Выше | Детали |
| PATCH | `/api/procurement/purchase-requests/:id/status` | PROCUREMENT, OM, ADMIN | Обновить статус |

---

### 4.10 Модуль `procurement` — PurchaseOrders

**`src/modules/procurement/purchaseOrdersRoutes.ts`**

| Метод | Путь | Роли | Описание |
|---|---|---|---|
| GET | `/api/procurement/po` | PROCUREMENT, OM, ADMIN | Список PO (фильтр: status, supplierId) |
| POST | `/api/procurement/po` | PROCUREMENT, OM, ADMIN | Создать PO (DRAFT) |
| GET | `/api/procurement/po/:id` | Выше | Детали PO |
| PUT | `/api/procurement/po/:id` | PROCUREMENT, OM, ADMIN (только DRAFT) | Редактировать |
| GET | `/api/procurement/po/:id/pdf` | Выше | Скачать PDF |
| POST | `/api/procurement/po/:id/send` | PROCUREMENT, OM, ADMIN | Отправить (DRAFT → SENT, email + Telegram) |
| POST | `/api/procurement/po/:id/receive` | WAREHOUSE, OM, ADMIN | Принять товар (SENT → RECEIVED) |
| POST | `/api/procurement/po/:id/close` | OM, ADMIN | Закрыть (RECEIVED → CLOSED) |

**Нумерация PO**: `PO-{YYYY}-{NNNN}` (NNNN — порядковый номер, padStart 4, `0001`)
**Логика генерации номера**: найти последний `poNumber` за текущий год, инкрементировать.

**Логика `POST /receive`:**
1. Принять body: `{ items: [{ poItemId, receivedQty }], photoUrl?, note? }`
2. Обновить `PurchaseOrderItem.receivedQty`
3. Создать `ReceiveRecord`
4. Увеличить `StockItem.quantity` на ЦС для каждого товара
5. Если все позиции `receivedQty >= quantity` → обновить `PurchaseRequest.status = DONE`
6. Обновить `PurchaseOrder.status = RECEIVED`, `receivedAt = now()`

---

### 4.11 Сервис `pdfService.ts`

**`src/shared/services/pdfService.ts`**

Функция: `generatePO(po: PurchaseOrderWithRelations): Promise<Buffer>`

**Содержимое PDF (на азербайджанском):**
```
Заголовок: SATIŞ SİFARİŞİ / PURCHASE ORDER
Номер: PO-2026-0001          Tarix / Date: DD.MM.YYYY
Göndərən / From: [название компании из env COMPANY_NAME]
Təchizatçı / Supplier: [supplier.name]
Əlaqə / Contact: [supplier.contact]  Tel: [supplier.phone]
Email: [supplier.email]

Таблица:
| № | Məhsulun adı | Miqdar | Ölçü vahidi | Vahid qiymət (₼) | Cəmi (₼) |
|---|--------------|--------|-------------|------------------|----------|
| 1 | ...          | ...    | ...         | ...              | ...      |

CƏMİ / TOTAL: XXX.XX ₼

Çatdırılma tarixi / Delivery date: [deliveryDate или не указано]
Qeyd / Note: [note]
```

Библиотека: `pdfkit`. Использовать встроенный шрифт `Helvetica` (поддерживает латиницу) — для кириллицы использовать `DejaVu` шрифт из системы (`/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`).

---

### 4.12 Сервис `telegramService.ts`

**`src/shared/services/telegramService.ts`**

Скопировать паттерн из `FeedbackQR/backend/src/services/telegramService.ts`.

**Адаптации:**
- Метод `sendPO(chatId: string, pdfBuffer: Buffer, poNumber: string): Promise<void>`
  - Отправить PDF как документ: `bot.sendDocument(chatId, pdfBuffer, {}, { filename: `${poNumber}.pdf`, contentType: 'application/pdf' })`
- Метод `sendNotification(chatId: string, message: string): Promise<void>`
  - Обычное текстовое уведомление

---

### 4.13 Сервис `emailService.ts`

**`src/shared/services/emailService.ts`**

Функция: `sendPOByEmail(to: string, poNumber: string, pdfBuffer: Buffer): Promise<void>`

Использовать `nodemailer`. Конфиг из env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.

Письмо:
- Subject: `Satış sifarişi ${poNumber}`
- Body: простой текст на азербайджанском
- Attachment: `${poNumber}.pdf`

---

### 4.14 Модуль `reports`

**`src/modules/reports/routes.ts`**

| Метод | Путь | Роли | Описание |
|---|---|---|---|
| GET | `/api/reports/stock` | Все (SUPERVISOR — только свои) | Текущие остатки |
| GET | `/api/reports/consumption` | Все (SUPERVISOR — только свои) | Расход за период (query: from, to, locationId) |
| GET | `/api/reports/purchases` | OM, ADMIN, PROCUREMENT | Закупки за период (query: from, to, supplierId) |
| GET | `/api/reports/requests` | Все | История запросов (query: from, to, locationId, status) |
| GET | `/api/reports/stock/export` | Все | Excel экспорт остатков |
| GET | `/api/reports/consumption/export` | Все | Excel экспорт расхода |
| GET | `/api/reports/purchases/export` | OM, ADMIN, PROCUREMENT | Excel экспорт закупок |

**Excel генерация**: использовать `exceljs`. Каждый export endpoint возвращает файл с заголовком `Content-Disposition: attachment; filename="report_*.xlsx"`.

---

### 4.15 Multer конфиг

**`src/shared/utils/upload.ts`**

```typescript
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  },
});
```

---

## ШАГ 5 — FRONTEND: ИНИЦИАЛИЗАЦИЯ

### 5.1 `MintStock/frontend/package.json`

```json
{
  "name": "mintstock-frontend",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.21.0",
    "axios": "^1.6.2",
    "@tanstack/react-query": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.2.2",
    "vite": "^5.0.8"
  }
}
```

---

### 5.2 `MintStock/frontend/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/mintstock/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
    },
  },
});
```

---

### 5.3 `MintStock/frontend/Dockerfile`

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

---

### 5.4 `MintStock/frontend/nginx.conf`

```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|svg|ico|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

### 5.5 `MintStock/frontend/src/services/api.ts`

```typescript
import axios from 'axios';

const BASE = import.meta.env.PROD ? '/mintstock/api' : '/api';

export const api = axios.create({
  baseURL: BASE,
  withCredentials: true,
});

// Interceptor: 401 → редирект на MintAuth
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      window.location.href = '/mintauth/auth/login?redirect=/mintstock/';
    }
    return Promise.reject(err);
  }
);
```

---

### 5.6 `MintStock/frontend/src/hooks/useAuth.tsx`

```typescript
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';

interface User {
  username: string;
  role: 'ADMIN' | 'OPERATIONS_MANAGER' | 'WAREHOUSE_MANAGER' | 'PROCUREMENT' | 'SUPERVISOR';
}

interface AuthContext {
  user: User | null;
  loading: boolean;
}

const Ctx = createContext<AuthContext>({ user: null, loading: true });

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/me')
      .then(r => setUser(r.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return <Ctx.Provider value={{ user, loading }}>{children}</Ctx.Provider>;
};

export const useAuth = () => useContext(Ctx);

// Хелперы ролей
export const canAdmin = (role: User['role']) => role === 'ADMIN';
export const canWarehouse = (role: User['role']) =>
  ['ADMIN', 'OPERATIONS_MANAGER', 'WAREHOUSE_MANAGER'].includes(role);
export const canProcurement = (role: User['role']) =>
  ['ADMIN', 'OPERATIONS_MANAGER', 'PROCUREMENT'].includes(role);
export const isSupervisor = (role: User['role']) => role === 'SUPERVISOR';
```

---

### 5.7 `MintStock/frontend/src/App.tsx`

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/Layout';

// Pages
import Dashboard from './pages/Dashboard';
import Requests from './pages/supervisor/Requests';
import Inventory from './pages/supervisor/Inventory';
import IncomingRequests from './pages/warehouse/IncomingRequests';
import InventoryWarehouse from './pages/warehouse/Inventory';
import PurchaseRequestsPage from './pages/procurement/PurchaseRequests';
import PurchaseOrdersPage from './pages/procurement/PurchaseOrders';
import ProductsPage from './pages/admin/Products';
import LocationsPage from './pages/admin/Locations';
import SuppliersPage from './pages/procurement/Suppliers'; // Поставщики — в procurement
import StockPage from './pages/stock/Stock';
import ReportsPage from './pages/reports/Reports';

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center">Загрузка...</div>;
  if (!user) return <div>Нет доступа</div>;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/stock" element={<StockPage />} />
        <Route path="/reports" element={<ReportsPage />} />

        {/* Supervisor */}
        <Route path="/requests" element={<Requests />} />
        <Route path="/inventory" element={<Inventory />} />

        {/* Warehouse */}
        <Route path="/warehouse/requests" element={<IncomingRequests />} />
        <Route path="/warehouse/inventory" element={<InventoryWarehouse />} />

        {/* Procurement */}
        <Route path="/procurement/purchase-requests" element={<PurchaseRequestsPage />} />
        <Route path="/procurement/orders" element={<PurchaseOrdersPage />} />

        {/* Admin / OM */}
        <Route path="/admin/products" element={<ProductsPage />} />
        <Route path="/admin/locations" element={<LocationsPage />} />

        {/* Procurement / OM / Admin */}
        <Route path="/procurement/suppliers" element={<SuppliersPage />} />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/mintstock">
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
```

---

## ШАГ 6 — FRONTEND: СТРАНИЦЫ

### 6.1 `Layout` компонент

**`src/components/Layout.tsx`**

Sidebar с навигацией. Пункты меню зависят от роли.
Каждая роль видит ТОЛЬКО свои пункты (не объединять):

```
Все роли:
  📊 Дашборд             → /

SUPERVISOR:
  📋 Мои запросы         → /requests
  📦 Инвентаризация      → /inventory
  📊 Остатки склада      → /stock

WAREHOUSE_MANAGER / OM / ADMIN:
  📥 Входящие запросы    → /warehouse/requests
  📦 Инвентаризация      → /warehouse/inventory
  📊 Остатки склада      → /stock
  🏢 Объекты             → /admin/locations

PROCUREMENT / OM / ADMIN:
  🛒 Запросы на закупку  → /procurement/purchase-requests
  📄 Purchase Orders     → /procurement/orders
  🤝 Поставщики          → /procurement/suppliers
  🛍️ Товары              → /admin/products

ADMIN / OM (видят ВСЁ из warehouse + ВСЁ из procurement):
  🛒 Запросы на закупку  → /procurement/purchase-requests
  📄 Purchase Orders     → /procurement/orders
  🤝 Поставщики          → /procurement/suppliers
  🛍️ Товары              → /admin/products
  📥 Входящие запросы    → /warehouse/requests
  📦 Инвентаризация      → /warehouse/inventory
  📊 Остатки склада      → /stock
  🏢 Объекты             → /admin/locations

Все роли:
  📈 Отчёты              → /reports
```

**Логика в коде** (как реализовать в `Layout.tsx`):

```typescript
const navItems = [
  // Всегда
  { icon: '📊', label: 'Дашборд', path: '/', roles: ['ALL'] },

  // Supervisor
  { icon: '📋', label: 'Мои запросы', path: '/requests', roles: ['SUPERVISOR'] },
  { icon: '📦', label: 'Инвентаризация', path: '/inventory', roles: ['SUPERVISOR'] },
  { icon: '📊', label: 'Остатки склада', path: '/stock', roles: ['SUPERVISOR'] },

  // Warehouse + OM + Admin
  { icon: '📥', label: 'Входящие запросы', path: '/warehouse/requests',
    roles: ['WAREHOUSE_MANAGER', 'OPERATIONS_MANAGER', 'ADMIN'] },
  { icon: '📦', label: 'Инвентаризация', path: '/warehouse/inventory',
    roles: ['WAREHOUSE_MANAGER', 'OPERATIONS_MANAGER', 'ADMIN'] },
  { icon: '📊', label: 'Остатки склада', path: '/stock',
    roles: ['WAREHOUSE_MANAGER', 'OPERATIONS_MANAGER', 'ADMIN'] },
  { icon: '🏢', label: 'Объекты', path: '/admin/locations',
    roles: ['WAREHOUSE_MANAGER', 'OPERATIONS_MANAGER', 'ADMIN'] },

  // Procurement + OM + Admin
  { icon: '🛒', label: 'Запросы на закупку', path: '/procurement/purchase-requests',
    roles: ['PROCUREMENT', 'OPERATIONS_MANAGER', 'ADMIN'] },
  { icon: '📄', label: 'Purchase Orders', path: '/procurement/orders',
    roles: ['PROCUREMENT', 'OPERATIONS_MANAGER', 'ADMIN'] },
  { icon: '🤝', label: 'Поставщики', path: '/procurement/suppliers',
    roles: ['PROCUREMENT', 'OPERATIONS_MANAGER', 'ADMIN'] },
  { icon: '🛍️', label: 'Товары', path: '/admin/products',
    roles: ['PROCUREMENT', 'OPERATIONS_MANAGER', 'ADMIN'] },

  // Всегда
  { icon: '📈', label: 'Отчёты', path: '/reports', roles: ['ALL'] },
];

// Фильтрация:
const visible = navItems.filter(item =>
  item.roles.includes('ALL') || item.roles.includes(user.role)
);
```

> ⚠️ Дублирующиеся пункты (например "Остатки склада" есть у SUPERVISOR и у WAREHOUSE) —
> это нормально, они идут в разные roles-массивы. Дубликатов в одном меню не будет,
> потому что пользователь имеет только одну роль.

---

### 6.2 Dashboard (`src/pages/Dashboard.tsx`)

Показывает виджеты в зависимости от роли:
- **SUPERVISOR**: Мои активные запросы (статус PENDING/PARTIAL), остатки на моих объектах
- **WAREHOUSE_MANAGER**: Входящие запросы (PENDING), запасы ЦС с предупреждением о нулевых остатках
- **PROCUREMENT**: Запросы на закупку (PENDING), PO в статусе SENT (ожидают прихода)
- **ADMIN/OM**: Все виджеты

---

### 6.3 Страница Запросов (Supervisor) — `src/pages/supervisor/Requests.tsx`

**Функционал:**
1. Таблица запросов текущего супервайзора
2. Кнопка "Новый запрос" → модальное окно
3. В модальном окне создания запроса:
   - Выбор объекта (из `/api/locations/my`)
   - Таблица товаров с полем количества
   - Кнопка "Авто-заполнить до лимита" — `GET /api/warehouse/requests/:locationId/autofill` → заполняет количества
4. Статус запроса цветом: PENDING=жёлтый, APPROVED=синий, PARTIAL=оранжевый, FULFILLED=зелёный, REJECTED=красный

---

### 6.4 Страница Инвентаризации (Supervisor) — `src/pages/supervisor/Inventory.tsx`

**Функционал:**
1. Список инвентаризаций по моим объектам
2. Кнопка "Начать инвентаризацию" для объекта (если нет активной)
3. Таблица товаров с полем "Фактическое кол-во" (ввод числа)
4. Кнопка "Завершить инвентаризацию" — отправляет все данные и закрывает
5. После закрытия — показывает расхождения (разница системного и фактического)

---

### 6.5 Страница Входящих запросов (Warehouse) — `src/pages/warehouse/IncomingRequests.tsx`

**Функционал:**
1. Таблица всех запросов со статусами
2. При клике на запрос — модальное окно детали
3. В деталях: по каждому товару показывает [запрошено / выдано / на ЦС]
4. Кнопка "Выдать" → поле количества для каждой позиции → `POST /api/warehouse/issues`
5. Кнопка "Создать запрос на закупку" (для позиций которых нет на складе) → `POST /api/procurement/purchase-requests`
6. Кнопка "Отклонить" (с полем причины)

---

### 6.6 Страница Purchase Orders — `src/pages/procurement/PurchaseOrders.tsx`

**Функционал:**
1. Таблица PO с фильтрами (статус, поставщик, период)
2. Кнопка "Создать PO":
   - Выбор поставщика
   - Добавление позиций (товар + количество + цена, берётся из SupplierPrice)
   - Дата доставки, заметка
3. Детали PO — кнопки:
   - "Скачать PDF" → `GET /api/procurement/po/:id/pdf`
   - "Отправить Email" / "Отправить Telegram" → `POST /api/procurement/po/:id/send`
   - "Принять товар" (для WAREHOUSE) → форма с полями receivedQty и загрузкой фото
4. Цвета статуса: DRAFT=серый, SENT=синий, RECEIVED=оранжевый, CLOSED=зелёный

---

### 6.7 Страница Товаров (Admin) — `src/pages/admin/Products.tsx`

**Функционал:**
1. Таблица товаров с фильтрами (категория, активные/архив)
2. Кнопки CRUD
3. Кнопка "Импорт из Excel" → загрузка файла → `POST /api/products/import`
4. Форма создания/редактирования: название, категория (выпадающий список), ед. изм.

---

### 6.8 Страница Объектов (Admin) — `src/pages/admin/Locations.tsx`

**Функционал:**
1. Таблица объектов (тип SITE) + Центральный склад (WAREHOUSE) отдельно
2. CRUD для объектов
3. Кнопка "Лимиты" → модальное окно: таблица товаров с полем `limitQty`
4. Кнопка "Супервайзоры" → модальное окно: список + добавить/убрать супервайзора по username

---

### 6.9 Страница Поставщиков (Procurement/OM/Admin) — `src/pages/procurement/Suppliers.tsx`

**Функционал:**
1. Таблица поставщиков
2. CRUD: название, контакт, телефон, email, telegram (chat_id)
3. Кнопка "Цены" → модальное окно: таблица товаров с полем цены (₼)

---

### 6.10 Страница Отчётов — `src/pages/reports/Reports.tsx`

**Функционал:**
1. Вкладки: Остатки / Расход / Закупки / История запросов
2. Фильтры: период (от/до), объект, поставщик
3. Таблица с данными
4. Кнопка "Экспорт Excel" → скачивание файла

---

## ШАГ 7 — ПОРЯДОК ВЫПОЛНЕНИЯ

**Выполнять строго в этом порядке:**

```
1. ШАГ 0 — изменения в общих файлах портала (docker-compose, nginx, portal.js)
2. ШАГ 1 — файлы инициализации backend (package.json, tsconfig, Dockerfile, .env.example)
3. ШАГ 2 — Prisma schema (полная, без изменений)
4. ШАГ 3 — Core files (db.ts, logger.ts, auth.ts, index.ts)
5. ШАГ 4 — Все модули backend (routes → controller → service)
6. ШАГ 5 — Инициализация frontend (package.json, vite.config, Dockerfile, nginx.conf)
7. ШАГ 6 — Frontend pages (сначала Layout, hooks, api.ts — потом страницы)
```

---

## КОНТРОЛЬНЫЙ СПИСОК ДЛЯ ПРОВЕРКИ

После каждого шага Claude проверяет:

**После ШАГ 0:**
- [ ] docker-compose: нет внешних портов у mintstock-backend
- [ ] nginx: uploads через proxy_pass, не alias
- [ ] portal.js: mintstock добавлен в оба объекта

**После ШАГ 2 (Prisma):**
- [ ] `StockItem.limitQty Int?` (НЕ `limit`, НЕ `limitAmount`)
- [ ] `PurchaseOrderItem.receivedQty Int @default(0)`
- [ ] Модель `PurchaseRequest` + `PurchaseRequestItem` присутствуют
- [ ] Все `@@map` названия в snake_case

**После ШАГ 3 (Auth middleware):**
- [ ] Проект ищется по имени `"MintStock"` (не `"FeedbackATM"`)
- [ ] 5 ролей: ADMIN, OPERATIONS_MANAGER, WAREHOUSE_MANAGER, PROCUREMENT, SUPERVISOR

**После ШАГ 4 (Backend):**
- [ ] `GET /api/health` возвращает 200
- [ ] Авто-расчёт лимита: `нужно = limitQty - текущийОстаток`, минимум 0
- [ ] Логика выдачи обновляет StockItem на ЦС (минус) и на объекте (плюс)
- [ ] Приёмка PO обновляет StockItem на ЦС (плюс)
- [ ] PDF генерируется на азербайджанском

**После ШАГ 5-6 (Frontend):**
- [ ] `vite.config.ts`: `base: '/mintstock/'`
- [ ] `BrowserRouter`: `basename="/mintstock"`
- [ ] Меню показывает только пункты по роли пользователя
- [ ] 401 редиректит на `/mintauth/auth/login?redirect=/mintstock/`

# MintStock - Warehouse & Procurement Module

## Статус реализации

✅ **Проект полностью реализован и готов к production deployment**

### Что реализовано:

#### Шаг 0: Интеграция с общими файлами портала
- ✅ Добавлена БД MintStock в `init-multiple-databases.sh`
- ✅ Добавлены сервисы mintstock-backend и mintstock-frontend в `docker-compose.all.yml`
- ✅ Добавлены upstreams и location-блоки в `nginx-portal.conf`
- ✅ Добавлена карточка MintStock в `portal-index.html` и `portal.js`
- ✅ Добавлены переменные окружения в `.env`

#### Шаг 1: Backend - Инициализация
- ✅ package.json со всеми зависимостями
- ✅ tsconfig.json
- ✅ Dockerfile с поддержкой PDF (шрифты DejaVu)
- ✅ .env.example

#### Шаг 2: Prisma Schema
- ✅ Полная схема БД со всеми моделями:
  - Product, Category
  - Supplier, SupplierPrice
  - Location, SupervisorLocation
  - StockItem
  - Request, RequestItem, IssueRecord
  - PurchaseRequest, PurchaseRequestItem
  - PurchaseOrder, PurchaseOrderItem, ReceiveRecord
  - Inventory, InventoryItem

#### Шаг 3: Core Backend Files
- ✅ db.ts - Prisma client
- ✅ logger.ts - Winston logger
- ✅ auth.ts - JWT authentication middleware с интеграцией MintAuth
- ✅ upload.ts - Multer configuration
- ✅ index.ts - Express server с всеми роутами

#### Шаг 4: Backend Modules - FULLY IMPLEMENTED ✅
- ✅ **auth/routes.ts** - `/api/auth/me`, `/api/auth/verify`
- ✅ **products/categoriesRoutes.ts** - Full CRUD с проверкой дубликатов
- ✅ **products/routes.ts** - CRUD + Excel import (авто-создание категорий)
- ✅ **suppliers/routes.ts** - CRUD + управление ценами (SupplierPrice)
- ✅ **locations/routes.ts** - CRUD + назначение супервайзоров + `/my` endpoint
- ✅ **stock/routes.ts** - Просмотр остатков (роледелаемая фильтрация), low stock alerts, bulk operations
- ✅ **warehouse/requestsRoutes.ts** - Создание запросов, autofill (limitQty - currentQty), статусы
- ✅ **warehouse/issueRoutes.ts** - Выдача товаров с транзакцией: warehouse→site, обновление RequestItem.issued, статусы
- ✅ **warehouse/inventoryRoutes.ts** - Начало инвентаризации, обновление actualQty, закрытие с расчётом difference
- ✅ **procurement/purchaseRequestsRoutes.ts** - CRUD заявок на закупку
- ✅ **procurement/purchaseOrdersRoutes.ts** - CRUD PO, PDF download, send (email/telegram), receive workflow, close
- ✅ **reports/routes.ts** - Отчёты (stock, consumption, purchases, requests) + Excel export

#### Шаг 4.5: Backend Services
- ✅ pdfService.ts - Генерация PDF для Purchase Orders
- ✅ telegramService.ts - Отправка через Telegram bot
- ✅ emailService.ts - Отправка через SMTP

#### Шаг 5: Frontend - Инициализация
- ✅ package.json
- ✅ vite.config.ts (base: '/mintstock/')
- ✅ tsconfig.json
- ✅ Dockerfile + nginx.conf
- ✅ tailwind.config.js, postcss.config.js
- ✅ index.html
- ✅ main.tsx, App.tsx
- ✅ api.ts - Axios with 401 redirect
- ✅ useAuth.tsx - Authentication context

#### Шаг 6: Frontend Pages (placeholder UI)
- ✅ Layout.tsx - Sidebar с ролевой навигацией
- ✅ Dashboard.tsx
- ✅ supervisor/Requests.tsx
- ✅ supervisor/Inventory.tsx
- ✅ warehouse/IncomingRequests.tsx
- ✅ warehouse/Inventory.tsx
- ✅ procurement/PurchaseRequests.tsx
- ✅ procurement/PurchaseOrders.tsx
- ✅ admin/Products.tsx
- ✅ admin/Locations.tsx
- ✅ admin/Suppliers.tsx
- ✅ stock/Stock.tsx
- ✅ reports/Reports.tsx

## Следующие шаги для полной реализации

### Backend - ✅ ПОЛНОСТЬЮ РЕАЛИЗОВАН

**Все 12 backend модулей реализованы с полной бизнес-логикой:**

1. ✅ **Products module** - полный CRUD + импорт из Excel (формат: A=name, B=category, C=unit)
2. ✅ **Categories module** - CRUD с проверкой дубликатов, счётчик товаров
3. ✅ **Suppliers module** - CRUD + управление ценами per product (upsert SupplierPrice)
4. ✅ **Locations module** - CRUD + назначение супервайзоров + `/my` для SUPERVISOR роли
5. ✅ **Stock module** - Role-based filtering (SUPERVISOR видит только свои локации), low stock alerts, bulk initial/limits
6. ✅ **Warehouse Requests** - Создание запросов (только SUPERVISOR для своих локаций), autofill logic (limitQty - quantity), статусы (PENDING→APPROVED/REJECTED→PARTIAL→FULFILLED)
7. ✅ **Warehouse Issue** - Выдача товаров в транзакции: проверка склада, уменьшение warehouse StockItem, увеличение site StockItem, обновление RequestItem.issued, пересчёт Request.status
8. ✅ **Inventory** - Начало инвентаризации (создание InventoryItem с systemQty), обновление actualQty, закрытие (расчёт difference, обновление StockItem.quantity = actualQty)
9. ✅ **Purchase Requests** - CRUD заявок на закупку (создаются WAREHOUSE ролями при недостатке товара)
10. ✅ **Purchase Orders** - Полный цикл: создание PO с items, PDF download (Azerbaijani), send via email/telegram, receive workflow (обновление receivedQty + warehouse StockItem), close PO
11. ✅ **Reports** - 4 отчёта с role-based фильтрацией: stock, consumption (IssueRecords), purchases (POs), requests
12. ✅ **Reports Export** - Excel export для всех отчётов с использованием ExcelJS

**Реализованные ключевые фичи:**
- Role-based access control для всех endpoints
- Транзакции Prisma для всех critical operations (issue, receive, inventory close)
- Bulk operations с индивидуальной обработкой ошибок
- PDF generation с Azerbaijani language support
- Telegram bot и email integration для отправки PO поставщикам
- Excel import/export (ExcelJS)
- Comprehensive logging (Winston) для всех операций
- Input validation и proper error handling (404, 400, 403, 409, 500)

#### Шаг 5: Frontend - FULLY IMPLEMENTED ✅

Все 12 pages полностью реализованы с real API integration:

1. ✅ **Dashboard.tsx** - Real-time statistics (active requests, low stock, active POs, pending PRs), quick links
2. ✅ **admin/Products.tsx** - CRUD forms, Excel import modal, category filter, active/inactive toggle
3. ✅ **admin/Locations.tsx** - CRUD forms, type filter (WAREHOUSE/SITE), supervisor assignments management
4. ✅ **admin/Suppliers.tsx** - CRUD forms, contact fields, blocked for SUPERVISOR role
5. ✅ **stock/Stock.tsx** - Table with location/category/product/quantity/limit/status, color-coded indicators (OK/Low/Critical)
6. ✅ **supervisor/Requests.tsx** - Create request modal with autofill button, dynamic item list (add/remove), request history
7. ✅ **supervisor/Inventory.tsx** - Start inventory modal (select my location), inventory list with status badges, update actualQty modal with editable table
8. ✅ **warehouse/IncomingRequests.tsx** - Request list with approve/reject workflow, issue items modal with quantity inputs
9. ✅ **warehouse/Inventory.tsx** - View all inventories, detailed modal (systemQty/actualQty/difference), close button with validation, completed summary stats
10. ✅ **procurement/PurchaseRequests.tsx** - Create PR modal with dynamic items, approve/reject workflow
11. ✅ **procurement/PurchaseOrders.tsx** - Create PO modal (supplier + items with prices), download PDF, send email/telegram buttons
12. ✅ **reports/Reports.tsx** - 4 report cards with Excel export buttons (stock, consumption, purchases, requests)

**Реализованные UI компоненты:**
- Формы создания/редактирования с validation
- Таблицы с данными и sorting
- Модальные окна (create, edit, view details, confirm actions)
- Фильтры (по категории, типу локации, статусу)
- Select dropdowns для связанных данных (locations, suppliers, products)
- File upload для Excel import
- Excel/PDF download buttons
- Status badges с цветовой индикацией
- Loading states и error handling
- Toast notifications (react-toastify)
- Role-based UI элементы (canManageWarehouse, canManageProcurement, isAdmin)

### Database

```bash
cd MintStock/backend
npm install
npx prisma generate
npx prisma db push
# или
npx prisma migrate dev
```

## Запуск проекта

### Development

**Backend:**
```bash
cd MintStock/backend
npm install
npm run dev
```

**Frontend:**
```bash
cd MintStock/frontend
npm install
npm run dev
```

### Production (Docker)

```bash
# Из корня MintStudio
docker-compose -f docker-compose.all.yml up -d
```

## Конфигурация

### Environment Variables

Добавить в `.env` (корень MintStudio):
```env
MINTSTOCK_DB_PASSWORD=<уже добавлен>
MINTSTOCK_DATABASE_URL=<уже добавлен>

# Опционально (если не указаны):
TELEGRAM_BOT_TOKEN=<токен бота>
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=<пароль>
COMPANY_NAME=MintStudio
```

## Роли и доступ

- **ADMIN** - полный доступ ко всем функциям
- **OPERATIONS_MANAGER** - управление складом и закупками
- **WAREHOUSE_MANAGER** - управление складом
- **PROCUREMENT** - управление закупками
- **SUPERVISOR** - создание запросов на пополнение

## Архитектура

### Backend (Node.js + Express + TypeScript + Prisma)
```
src/
├── db.ts - Prisma client
├── index.ts - Express app
├── shared/
│   ├── middleware/
│   │   └── auth.ts - JWT auth + роли MintStock
│   ├── services/
│   │   ├── pdfService.ts - PDF generation
│   │   ├── emailService.ts - Email sending
│   │   └── telegramService.ts - Telegram bot
│   └── utils/
│       ├── logger.ts - Winston
│       └── upload.ts - Multer
└── modules/
    ├── auth/
    ├── products/
    ├── suppliers/
    ├── locations/
    ├── stock/
    ├── warehouse/
    ├── procurement/
    └── reports/
```

### Frontend (React + TypeScript + Tailwind + Vite)
```
src/
├── App.tsx - Router
├── main.tsx - Entry point
├── components/
│   └── Layout.tsx - Sidebar navigation
├── hooks/
│   └── useAuth.tsx - Auth context
├── services/
│   └── api.ts - Axios client
└── pages/
    ├── Dashboard.tsx
    ├── supervisor/
    ├── warehouse/
    ├── procurement/
    ├── admin/
    ├── stock/
    └── reports/
```

## Документация

Полная спецификация в файле: `COPILOT_INSTRUCTIONS.md`

## Контрольный список

- [x] Dockerfile backend с шрифтами для PDF
- [x] Prisma schema: `StockItem.limitQty Int?`
- [x] Auth middleware: поиск проекта "MintStock"
- [x] Vite config: `base: '/mintstock/'`
- [x] BrowserRouter: `basename="/mintstock"`
- [x] Nginx: uploads через proxy_pass
- [x] Docker-compose: нет внешних портов для backend
- [x] Все backend модули реализованы (12/12)
- [x] Все frontend страницы реализованы (12/12)
- [x] PDF generation в Azerbaijani language
- [x] Excel import/export функциональность
- [x] Email и Telegram интеграция

## Следующие шаги для Production Deployment

1. **Миграция БД:**
   ```bash
   cd MintStudio/MintStock/backend
   npx prisma migrate deploy
   ```

2. **Запуск Docker Compose:**
   ```bash
   cd MintStudio
   docker-compose -f docker-compose.all.yml up -d mintstock-backend mintstock-frontend
   ```

3. **Проверка работоспособности:**
   - Откройте `http://your-server/mintstock/`
   - Войдите через MintAuth
   - Протестируйте ключевые workflows:
     - Создание продуктов (+ Excel import)
     - Создание заявки с autofill
     - Approve → Issue workflow
     - Inventory start → update → close
     - Purchase Request → Purchase Order → PDF download → Send → Receive

4. **Настройка интеграций:**
   - Добавьте `TELEGRAM_BOT_TOKEN` в `.env` для отправки PO через Telegram
   - Настройте SMTP параметры для email отправки PO

5. **User Acceptance Testing:**
   - ADMIN: управление справочниками
   - WAREHOUSE_MANAGER: обработка запросов, инвентаризация
   - SUPERVISOR: создание запросов, физический подсчёт
   - PROCUREMENT: закупки, работа с поставщиками
   - OPERATIONS_MANAGER: отчёты и аналитика

## Ключевые workflows

**Warehouse Request Flow:**
SUPERVISOR создаёт запрос → autofill до limitQty → WAREHOUSE одобряет → Issue с quantity → система обновляет StockItem (warehouse↓, site↑) → status = FULFILLED

**Inventory Flow:**
SUPERVISOR запускает inventory → вводит actualQty (физический подсчёт) → WAREHOUSE закрывает → система рассчитывает difference → обновляет StockItem.quantity = actualQty

**Purchase Order Flow:**
PROCUREMENT создаёт PO → скачивает PDF → отправляет поставщику (email/telegram) → получает товар → вводит receivedQty → система обновляет warehouse StockItem → status = COMPLETED

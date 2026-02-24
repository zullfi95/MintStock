import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // ─── 1. КАТЕГОРИИ ────────────────────────────────────────────
  console.log('📦 Creating categories...');
  
  const categories = [
    { name: 'Строительные материалы' },
    { name: 'Электрика' },
    { name: 'Сантехника' },
    { name: 'Инструменты' },
    { name: 'Крепеж' },
    { name: 'Лакокрасочные материалы' },
    { name: 'Расходные материалы' },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    });
  }

  // ─── 2. ТОВАРЫ ───────────────────────────────────────────────
  console.log('📦 Creating products...');

  const categoryMap: Record<string, string> = {};
  const allCategories = await prisma.category.findMany();
  allCategories.forEach(c => {
    categoryMap[c.name] = c.id;
  });

  const products = [
    { name: 'Цемент М500', categoryId: categoryMap['Строительные материалы'], unit: 'кг' },
    { name: 'Песок', categoryId: categoryMap['Строительные материалы'], unit: 'кг' },
    { name: 'Щебень', categoryId: categoryMap['Строительные материалы'], unit: 'кг' },
    { name: 'Кирпич красный', categoryId: categoryMap['Строительные материалы'], unit: 'шт' },
    { name: 'Кабель ВВГ 3x2.5', categoryId: categoryMap['Электрика'], unit: 'м' },
    { name: 'Автомат 16А', categoryId: categoryMap['Электрика'], unit: 'шт' },
    { name: 'Розетка двойная', categoryId: categoryMap['Электрика'], unit: 'шт' },
    { name: 'Лампочка LED 10W', categoryId: categoryMap['Электрика'], unit: 'шт' },
    { name: 'Труба ПВХ 50мм', categoryId: categoryMap['Сантехника'], unit: 'м' },
    { name: 'Труба ПВХ 110мм', categoryId: categoryMap['Сантехника'], unit: 'м' },
    { name: 'Кран шаровый 1/2"', categoryId: categoryMap['Сантехника'], unit: 'шт' },
    { name: 'Смеситель', categoryId: categoryMap['Сантехника'], unit: 'шт' },
    { name: 'Дрель ударная', categoryId: categoryMap['Инструменты'], unit: 'шт' },
    { name: 'Перфоратор', categoryId: categoryMap['Инструменты'], unit: 'шт' },
    { name: 'Болгарка', categoryId: categoryMap['Инструменты'], unit: 'шт' },
    { name: 'Молоток', categoryId: categoryMap['Инструменты'], unit: 'шт' },
    { name: 'Саморез 4x50', categoryId: categoryMap['Крепеж'], unit: 'кг' },
    { name: 'Дюбель 8x50', categoryId: categoryMap['Крепеж'], unit: 'шт' },
    { name: 'Гвозди 100мм', categoryId: categoryMap['Крепеж'], unit: 'кг' },
    { name: 'Краска белая 5л', categoryId: categoryMap['Лакокрасочные материалы'], unit: 'упак' },
    { name: 'Грунтовка 5л', categoryId: categoryMap['Лакокрасочные материалы'], unit: 'упак' },
    { name: 'Кисть 50мм', categoryId: categoryMap['Расходные материалы'], unit: 'шт' },
    { name: 'Валик 200мм', categoryId: categoryMap['Расходные материалы'], unit: 'шт' },
    { name: 'Перчатки рабочие', categoryId: categoryMap['Расходные материалы'], unit: 'пар' },
  ];

  const productMap: Record<string, string> = {};
  for (const prod of products) {
    const created = await prisma.product.create({
      data: prod
    });
    productMap[prod.name] = created.id;
  }

  // ─── 3. ПОСТАВЩИКИ ───────────────────────────────────────────
  console.log('🚚 Creating suppliers...');

  const suppliers = [
    { name: 'BuildMart', contact: 'Əli Məmmədov', phone: '+994501234567', email: 'info@buildmart.az' },
    { name: 'Elektrik', contact: 'Fatma Əliyeva', phone: '+994502345678', email: 'sales@elektrik.az' },
    { name: 'SantexPro', contact: 'Vəli Həsənov', phone: '+994503456789', email: 'info@santexpro.az' },
    { name: 'ToolWorld', contact: 'Aysel Kərimova', phone: '+994504567890', email: 'contact@toolworld.az' },
    { name: 'BoyaMarket', contact: 'Rəşad Quliyev', phone: '+994505678901', email: 'info@boyamarket.az' },
  ];

  const supplierMap: Record<string, string> = {};
  for (const sup of suppliers) {
    const created = await prisma.supplier.create({
      data: sup
    });
    supplierMap[sup.name] = created.id;
  }

  // ─── 4. ЛОКАЦИИ ──────────────────────────────────────────────
  console.log('📍 Creating locations...');

  const warehouse = await prisma.location.create({
    data: {
      name: 'Центральный Склад (ЦС)',
      type: 'WAREHOUSE',
      address: 'Bakı, Nobel prospekti 15',
    },
  });

  const sites = [
    { name: 'Объект "White City"', address: 'Bakı, Ağ şəhər' },
    { name: 'Объект "Flame Towers"', address: 'Bakı, Neftçilər prospekti' },
    { name: 'Объект "Crystal Hall"', address: 'Bakı, Heydər Əliyev prospekti' },
    { name: 'Объект "Port Baku"', address: 'Bakı, Nizami küçəsi' },
  ];

  const siteLocations: Record<string, string> = {};
  for (const site of sites) {
    const loc = await prisma.location.create({
      data: {
        name: site.name,
        type: 'SITE',
        address: site.address,
      },
    });
    siteLocations[site.name] = loc.id;
  }

  // ─── 5. ТОВАРЫ НА СКЛАДЕ (Остатки) ───────────────────────────
  console.log('📊 Creating stock items...');

  // Остатки на ЦС
  const warehouseStock = [
    { name: 'Цемент М500', quantity: 500, limitQty: 100 },
    { name: 'Песок', quantity: 1000, limitQty: 200 },
    { name: 'Щебень', quantity: 800, limitQty: 150 },
    { name: 'Кирпич красный', quantity: 2000, limitQty: 500 },
    { name: 'Кабель ВВГ 3x2.5', quantity: 200, limitQty: 50 },
    { name: 'Автомат 16А', quantity: 100, limitQty: 20 },
    { name: 'Розетка двойная', quantity: 150, limitQty: 30 },
    { name: 'Лампочка LED 10W', quantity: 300, limitQty: 50 },
    { name: 'Труба ПВХ 50мм', quantity: 100, limitQty: 20 },
    { name: 'Труба ПВХ 110мм', quantity: 50, limitQty: 10 },
    { name: 'Кран шаровый 1/2"', quantity: 80, limitQty: 15 },
    { name: 'Смеситель', quantity: 30, limitQty: 5 },
    { name: 'Дрель ударная', quantity: 15, limitQty: 3 },
    { name: 'Перфоратор', quantity: 10, limitQty: 2 },
    { name: 'Болгарка', quantity: 12, limitQty: 3 },
    { name: 'Молоток', quantity: 40, limitQty: 10 },
    { name: 'Саморез 4x50', quantity: 200, limitQty: 50 },
    { name: 'Дюбель 8x50', quantity: 500, limitQty: 100 },
    { name: 'Гвозди 100мм', quantity: 150, limitQty: 30 },
    { name: 'Краска белая 5л', quantity: 50, limitQty: 10 },
    { name: 'Грунтовка 5л', quantity: 40, limitQty: 10 },
    { name: 'Кисть 50мм', quantity: 100, limitQty: 20 },
    { name: 'Валик 200мм', quantity: 80, limitQty: 15 },
    { name: 'Перчатки рабочие', quantity: 200, limitQty: 50 },
  ];

  for (const stock of warehouseStock) {
    const productId = productMap[stock.name];
    if (productId) {
      await prisma.stockItem.upsert({
        where: {
          locationId_productId: {
            locationId: warehouse.id,
            productId,
          },
        },
        update: {
          quantity: stock.quantity,
          limitQty: stock.limitQty,
        },
        create: {
          locationId: warehouse.id,
          productId,
          quantity: stock.quantity,
          limitQty: stock.limitQty,
        },
      });
    }
  }

  // Минимальные остатки на объектах
  for (const siteName of Object.keys(siteLocations)) {
    const siteId = siteLocations[siteName];
    // Добавляем по несколько товаров на каждый объект
    const siteStock = [
      { name: 'Кабель ВВГ 3x2.5', quantity: 20, limitQty: 10 },
      { name: 'Автомат 16А', quantity: 10, limitQty: 5 },
      { name: 'Розетка двойная', quantity: 15, limitQty: 5 },
      { name: 'Труба ПВХ 50мм', quantity: 10, limitQty: 5 },
      { name: 'Саморез 4x50', quantity: 20, limitQty: 10 },
    ];

    for (const stock of siteStock) {
      const productId = productMap[stock.name];
      if (productId) {
        await prisma.stockItem.upsert({
          where: {
            locationId_productId: {
              locationId: siteId,
              productId,
            },
          },
          update: {
            quantity: stock.quantity,
            limitQty: stock.limitQty,
          },
          create: {
            locationId: siteId,
            productId,
            quantity: stock.quantity,
            limitQty: stock.limitQty,
          },
        });
      }
    }
  }

  // ─── 6. ЦЕНЫ ПОСТАВЩИКОВ ─────────────────────────────────────
  console.log('💰 Creating supplier prices...');

  // Примерные цены
  const supplierPrices = [
    { supplier: 'BuildMart', product: 'Цемент М500', price: 8.50 },
    { supplier: 'BuildMart', product: 'Песок', price: 0.05 },
    { supplier: 'BuildMart', product: 'Щебень', price: 0.15 },
    { supplier: 'BuildMart', product: 'Кирпич красный', price: 0.40 },
    { supplier: 'Elektrik', product: 'Кабель ВВГ 3x2.5', price: 2.50 },
    { supplier: 'Elektrik', product: 'Автомат 16А', price: 12.00 },
    { supplier: 'Elektrik', product: 'Розетка двойная', price: 8.50 },
    { supplier: 'Elektrik', product: 'Лампочка LED 10W', price: 3.00 },
    { supplier: 'SantexPro', product: 'Труба ПВХ 50мм', price: 4.00 },
    { supplier: 'SantexPro', product: 'Труба ПВХ 110мм', price: 8.00 },
    { supplier: 'SantexPro', product: 'Кран шаровый 1/2"', price: 15.00 },
    { supplier: 'SantexPro', product: 'Смеситель', price: 85.00 },
    { supplier: 'ToolWorld', product: 'Дрель ударная', price: 120.00 },
    { supplier: 'ToolWorld', product: 'Перфоратор', price: 250.00 },
    { supplier: 'ToolWorld', product: 'Болгарка', price: 95.00 },
    { supplier: 'ToolWorld', product: 'Молоток', price: 18.00 },
    { supplier: 'BoyaMarket', product: 'Краска белая 5л', price: 35.00 },
    { supplier: 'BoyaMarket', product: 'Грунтовка 5л', price: 25.00 },
    { supplier: 'BoyaMarket', product: 'Кисть 50мм', price: 2.50 },
    { supplier: 'BoyaMarket', product: 'Валик 200мм', price: 8.00 },
  ];

  for (const sp of supplierPrices) {
    const supplierId = supplierMap[sp.supplier];
    const productId = productMap[sp.product];
    if (supplierId && productId) {
      await prisma.supplierPrice.upsert({
        where: {
          supplierId_productId: {
            supplierId,
            productId,
          },
        },
        update: { price: sp.price },
        create: {
          supplierId,
          productId,
          price: sp.price,
        },
      });
    }
  }

  console.log('✅ Seed completed successfully!');
  console.log(`   - ${categories.length} categories`);
  console.log(`   - ${products.length} products`);
  console.log(`   - ${suppliers.length} suppliers`);
  console.log(`   - 1 warehouse + ${Object.keys(siteLocations).length} sites`);
  console.log(`   - ${warehouseStock.length} stock items on warehouse`);
  console.log(`   - ${supplierPrices.length} supplier prices`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

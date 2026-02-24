import PDFDocument from 'pdfkit';

interface PurchaseOrderWithRelations {
  id: string;
  poNumber: string;
  supplier: {
    name: string;
    contact: string;
    phone?: string | null;
    email?: string | null;
  };
  items: Array<{
    product: {
      name: string;
      unit: string;
    };
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  totalAmount: number;
  deliveryDate?: Date | null;
  note?: string | null;
  createdAt: Date;
}

export async function generatePO(po: PurchaseOrderWithRelations): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      // Регистрация Unicode шрифтов DejaVu для азербайджанских символов (ə, ı, ü, ö, ğ, ş)
      let fontNormal = 'Helvetica';
      let fontBold = 'Helvetica-Bold';
      try {
        const fontPath = '/usr/share/fonts/ttf-dejavu';
        doc.registerFont('DejaVu', `${fontPath}/DejaVuSans.ttf`);
        doc.registerFont('DejaVu-Bold', `${fontPath}/DejaVuSans-Bold.ttf`);
        fontNormal = 'DejaVu';
        fontBold = 'DejaVu-Bold';
      } catch {
        // DejaVu не найден (например, запуск вне Docker) — используем Helvetica
      }

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Заголовок
      doc.fontSize(20).text('SATIŞ SİFARİŞİ / PURCHASE ORDER', { align: 'center' });
      doc.moveDown();

      // Информация о заказе
      doc.fontSize(12);
      const dateStr = po.createdAt.toLocaleDateString('az-AZ');
      doc.text(`Nömrə / Number: ${po.poNumber}`, { continued: true });
      doc.text(`                    Tarix / Date: ${dateStr}`, { align: 'right' });
      doc.moveDown();

      // Компания отправитель
      const companyName = process.env.COMPANY_NAME || 'MintStudio';
      doc.text(`Göndərən / From: ${companyName}`);
      doc.moveDown();

      // Поставщик
      doc.text(`Təchizatçı / Supplier: ${po.supplier.name}`);
      doc.text(`Əlaqə / Contact: ${po.supplier.contact}`);
      if (po.supplier.phone) doc.text(`Tel: ${po.supplier.phone}`);
      if (po.supplier.email) doc.text(`Email: ${po.supplier.email}`);
      doc.moveDown(2);

      // Таблица товаров
      const tableTop = doc.y;
      const col1X = 50;
      const col2X = 80;
      const col3X = 250;
      const col4X = 320;
      const col5X = 390;
      const col6X = 470;

      // Заголовки таблицы
      doc.fontSize(10).font(fontBold);
      doc.text('№', col1X, tableTop);
      doc.text('Məhsulun adı', col2X, tableTop);
      doc.text('Miqdar', col3X, tableTop);
      doc.text('Ölçü', col4X, tableTop);
      doc.text('Qiymət (₼)', col5X, tableTop);
      doc.text('Cəmi (₼)', col6X, tableTop);

      doc.moveTo(col1X, tableTop + 15).lineTo(550, tableTop + 15).stroke();

      // Позиции
      doc.font(fontNormal);
      let y = tableTop + 20;
      po.items.forEach((item, index) => {
        doc.text((index + 1).toString(), col1X, y);
        doc.text(item.product.name, col2X, y, { width: 160 });
        doc.text(item.quantity.toString(), col3X, y);
        doc.text(item.product.unit, col4X, y);
        doc.text(item.unitPrice.toFixed(2), col5X, y);
        doc.text(item.totalPrice.toFixed(2), col6X, y);
        y += 25;
      });

      doc.moveTo(col1X, y).lineTo(550, y).stroke();
      y += 10;

      // Итого
      doc.fontSize(12).font(fontBold);
      doc.text(`CƏMİ / TOTAL: ${po.totalAmount.toFixed(2)} ₼`, col5X, y, { align: 'right' });
      doc.moveDown(2);

      // Дата доставки и заметка
      doc.fontSize(10).font(fontNormal);
      if (po.deliveryDate) {
        const deliveryStr = po.deliveryDate.toLocaleDateString('az-AZ');
        doc.text(`Çatdırılma tarixi / Delivery date: ${deliveryStr}`);
      }
      if (po.note) {
        doc.text(`Qeyd / Note: ${po.note}`);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

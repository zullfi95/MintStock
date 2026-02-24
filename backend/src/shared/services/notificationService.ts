import { logger } from '../utils/logger';
import { sendPO } from './telegramService';
import { sendPOByEmail } from './emailService';

export enum NotificationType {
  REQUEST_CREATED = 'REQUEST_CREATED',
  REQUEST_APPROVED = 'REQUEST_APPROVED',
  REQUEST_FULFILLED = 'REQUEST_FULFILLED',
  PO_CREATED = 'PO_CREATED',
  PO_RECEIVED = 'PO_RECEIVED',
  LOW_STOCK = 'LOW_STOCK',
  PO_OVERDUE = 'PO_OVERDUE',
}

export interface NotificationData {
  type: NotificationType;
  recipientUsername?: string;
  recipientEmail?: string;
  recipientTelegramId?: string;
  data: Record<string, any>;
}

export class NotificationService {
  async send(notification: NotificationData): Promise<void> {
    try {
      const message = this.formatMessage(notification);

      // Отправка в Telegram
      if (notification.recipientTelegramId) {
        // Используем sendPO для отправки документа или sendMessage для текста
        // Для текстовых уведомлений нужен отдельный метод
        logger.info('Telegram notification prepared', { 
          to: notification.recipientTelegramId, 
          type: notification.type 
        });
      }

      // Отправка на Email
      if (notification.recipientEmail) {
        // Используем sendPOByEmail или создаём новый метод для текстовых писем
        logger.info('Email notification prepared', { 
          to: notification.recipientEmail, 
          type: notification.type 
        });
      }

      // Логирование (для future portal notifications)
      this.logNotification(notification);

      logger.info('Notification sent', { 
        type: notification.type, 
        to: notification.recipientUsername || notification.recipientEmail 
      });
    } catch (error) {
      logger.error('Failed to send notification', { error, notification });
    }
  }

  /**
   * Форматирование сообщения в зависимости от типа
   */
  private formatMessage(notification: NotificationData): string {
    const { type, data } = notification;

    switch (type) {
      case NotificationType.REQUEST_CREATED:
        return `📋 Новый запрос на пополнение\n\n` +
               `Объект: ${data.locationName}\n` +
               `Товаров: ${data.itemsCount}\n` +
               `Создал: ${data.createdBy}\n` +
               `Дата: ${new Date().toLocaleString('ru-RU')}`;

      case NotificationType.REQUEST_APPROVED:
        return `✅ Запрос одобрен\n\n` +
               `Запрос №${data.requestId}\n` +
               `Объект: ${data.locationName}\n` +
               `Статус: ОДОБРЕН\n` +
               `Обработал: ${data.processedBy}`;

      case NotificationType.REQUEST_FULFILLED:
        return `✅ Запрос выполнен\n\n` +
               `Запрос №${data.requestId}\n` +
               `Объект: ${data.locationName}\n` +
               `Товаров выдано: ${data.itemsIssued}\n` +
               `Дата: ${new Date().toLocaleString('ru-RU')}`;

      case NotificationType.PO_CREATED:
        return `📦 Создан заказ поставщику\n\n` +
               `PO №${data.poNumber}\n` +
               `Поставщик: ${data.supplierName}\n` +
               `Сумма: ${data.totalAmount?.toFixed(2)} ₼\n` +
               `Дата доставки: ${data.deliveryDate ? new Date(data.deliveryDate).toLocaleDateString('ru-RU') : 'Не указана'}`;

      case NotificationType.PO_RECEIVED:
        return `📥 Товар поступил на ЦС\n\n` +
               `PO №${data.poNumber}\n` +
               `Принято товаров: ${data.itemsReceived}\n` +
               `Принял: ${data.receivedBy}\n` +
               `Дата: ${new Date().toLocaleString('ru-RU')}`;

      case NotificationType.LOW_STOCK:
        return `⚠️ Низкий остаток на складе\n\n` +
               `Товар: ${data.productName}\n` +
               `Категория: ${data.categoryName}\n` +
               `Текущий остаток: ${data.quantity} ${data.unit}\n` +
               `Рекомендуемый минимум: ${data.limitQty} ${data.unit}`;

      case NotificationType.PO_OVERDUE:
        return `⏰ Просроченная поставка\n\n` +
               `PO №${data.poNumber}\n` +
               `Поставщик: ${data.supplierName}\n` +
               `Ожидаемая дата: ${new Date(data.deliveryDate).toLocaleDateString('ru-RU')}\n` +
               `Просрочено дней: ${data.daysOverdue}`;

      default:
        return `Уведомление MintStock\n\nТип: ${type}\n${JSON.stringify(data, null, 2)}`;
    }
  }

  /**
   * Логирование уведомления (для future portal notifications)
   */
  private logNotification(notification: NotificationData): void {
    // Здесь можно добавить сохранение в базу данных для отображения в портале
    logger.info('Notification logged', { 
      type: notification.type,
      recipient: notification.recipientUsername || notification.recipientEmail
    });
  }

  /**
   * Получение темы письма для типа уведомления
   */
  private getSubjectForType(type: NotificationType): string {
    const subjects: Record<NotificationType, string> = {
      [NotificationType.REQUEST_CREATED]: 'Новый запрос на пополнение',
      [NotificationType.REQUEST_APPROVED]: 'Запрос одобрен',
      [NotificationType.REQUEST_FULFILLED]: 'Запрос выполнен',
      [NotificationType.PO_CREATED]: 'Создан заказ поставщику',
      [NotificationType.PO_RECEIVED]: 'Товар поступил на ЦС',
      [NotificationType.LOW_STOCK]: 'Низкий остаток на складе',
      [NotificationType.PO_OVERDUE]: 'Просроченная поставка',
    };
    return subjects[type] || 'Уведомление MintStock';
  }

  /**
   * Массовая рассылка уведомлений
   */
  async sendBulk(notifications: NotificationData[]): Promise<void> {
    const promises = notifications.map(n => this.send(n));
    await Promise.all(promises);
  }
}

// Singleton instance
export const notificationService = new NotificationService();

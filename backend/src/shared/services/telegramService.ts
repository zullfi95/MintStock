import TelegramBot from 'node-telegram-bot-api';
import { logger } from '../utils/logger';

let bot: TelegramBot | null = null;

function getBot(): TelegramBot | null {
  if (!bot && process.env.TELEGRAM_BOT_TOKEN) {
    try {
      bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
    } catch (error) {
      logger.error('Failed to initialize Telegram bot', { error });
    }
  }
  return bot;
}

export async function sendPO(chatId: string, pdfBuffer: Buffer, poNumber: string): Promise<void> {
  try {
    const botInstance = getBot();
    if (!botInstance) {
      logger.warn('Telegram bot not configured');
      return;
    }

    await botInstance.sendDocument(chatId, pdfBuffer, {}, {
      filename: `${poNumber}.pdf`,
      contentType: 'application/pdf',
    });
    logger.info(`PO ${poNumber} sent to Telegram chat ${chatId}`);
  } catch (error) {
    logger.error('Failed to send PO via Telegram', { error, chatId, poNumber });
    throw error;
  }
}

export async function sendNotification(chatId: string, message: string): Promise<void> {
  try {
    const botInstance = getBot();
    if (!botInstance) {
      logger.warn('Telegram bot not configured');
      return;
    }

    await botInstance.sendMessage(chatId, message);
    logger.info(`Notification sent to Telegram chat ${chatId}`);
  } catch (error) {
    logger.error('Failed to send notification via Telegram', { error, chatId });
    throw error;
  }
}

import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !port || !user || !pass) {
      logger.warn('SMTP configuration incomplete');
      return null;
    }

    transporter = nodemailer.createTransport({
      host,
      port: parseInt(port),
      secure: parseInt(port) === 465,
      auth: { user, pass },
    });
  }
  return transporter;
}

export async function sendPOByEmail(to: string, poNumber: string, pdfBuffer: Buffer): Promise<void> {
  try {
    const transporterInstance = getTransporter();
    if (!transporterInstance) {
      logger.warn('Email transporter not configured');
      return;
    }

    const subject = `Satış sifarişi ${poNumber}`;
    const text = `Hörmətli tərəfdaş,\n\nSatış sifarişi ${poNumber} əlavədə göndərilir.\n\nHörmətlə,\n${process.env.COMPANY_NAME || 'MintStudio'}`;

    await transporterInstance.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject,
      text,
      attachments: [
        {
          filename: `${poNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    logger.info(`PO ${poNumber} sent to ${to}`);
  } catch (error) {
    logger.error('Failed to send PO via email', { error, to, poNumber });
    throw error;
  }
}

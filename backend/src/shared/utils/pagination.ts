import { PrismaClient } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

// Augment Express Request type
declare global {
  namespace Express {
    interface Request {
      pagination?: {
        page: number;
        limit: number;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
      };
    }
  }
}

/**
 * Универсальная функция для пагинации запросов к Prisma
 */
export async function paginate<T>(
  prisma: PrismaClient,
  model: string,
  options: {
    where?: any;
    include?: any;
    orderBy?: any;
  } = {},
  pagination: PaginationParams = {}
): Promise<PaginatedResult<T>> {
  const page = Math.max(1, Math.floor(pagination.page || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(pagination.limit || 20)));
  const skip = (page - 1) * limit;

  // Получаем общее количество записей
  const total = await (prisma as any)[model].count({
    where: options.where,
  });

  // Получаем данные с пагинацией
  const data = await (prisma as any)[model].findMany({
    ...options,
    skip,
    take: limit,
    orderBy: pagination.sortBy
      ? { [pagination.sortBy]: pagination.sortOrder || 'desc' }
      : options.orderBy,
  });

  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

/**
 * Middleware для добавления пагинации в Express запросы
 */
export function paginationMiddleware(
  req: any,
  res: any,
  next: any
) {
  const { page, limit, sortBy, sortOrder } = req.query;

  req.pagination = {
    page: page ? parseInt(page, 10) : 1,
    limit: limit ? parseInt(limit, 10) : 20,
    sortBy: sortBy as string | undefined,
    sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
  };

  // Валидация
  if (req.pagination.page < 1) req.pagination.page = 1;
  if (req.pagination.limit < 1) req.pagination.limit = 1;
  if (req.pagination.limit > 100) req.pagination.limit = 100;

  next();
}

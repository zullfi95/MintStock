FROM node:20-alpine AS builder
WORKDIR /app

# Установить шрифты для pdfkit (PDF генерация) и OpenSSL для Prisma
RUN apk add --no-cache fontconfig ttf-dejavu openssl

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

RUN apk add --no-cache fontconfig ttf-dejavu curl openssl

COPY package*.json ./
RUN npm ci --only=production

COPY prisma ./prisma/
RUN npx prisma generate

COPY --from=builder /app/dist ./dist/

RUN mkdir -p /app/uploads

EXPOSE 3003
CMD ["node", "dist/index.js"]

# Base: node:20-slim (NAO alpine — o libssl do alpine quebra o Prisma).
FROM node:20-slim AS base
# openssl é exigido pelo Prisma engine
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- deps: instala dependencias ----
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# ---- builder: gera prisma client + build do Next ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runner: imagem final enxuta (standalone) ----
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
# Next standalone precisa escutar em 0.0.0.0 (senao o proxy nao alcanca -> 502)
ENV HOSTNAME=0.0.0.0
# Artefatos do build standalone
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Prisma: schema + engine + client, para rodar db push / seed / user:create no runner
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "server.js"]

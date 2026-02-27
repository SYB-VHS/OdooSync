# SyncOdoo autonome – build depuis le dossier SyncOdoo
# docker build -t sync-odoo .
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production

# ODOO_* et POSTGRES_* requis au runtime
CMD ["npm", "start"]

FROM node:20-alpine

WORKDIR /app

# Copy application files
COPY package.json ./
COPY server.mjs ./
COPY index.html ./
COPY client.js ./

# Create data directory for local store persistence
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=8787
ENV FREESHOP_NO_OPEN=1

EXPOSE 8787

CMD ["node", "server.mjs"]

FROM node:20-alpine

WORKDIR /app

COPY docker-entrypoint.sh /usr/local/bin/frontend-entrypoint.sh
RUN chmod +x /usr/local/bin/frontend-entrypoint.sh

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Document exposed port
EXPOSE 5173

# Start dev server with host 0.0.0.0 and refresh dependencies when manifests change
CMD ["frontend-entrypoint.sh"]

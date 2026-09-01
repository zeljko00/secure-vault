FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Document exposed port
EXPOSE 5173

# Start dev server with host 0.0.0.0 to be accessible from outside container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

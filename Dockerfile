FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the TypeScript code
RUN npm run build-docker
RUN npm prune --production

# Create persistent directory
RUN mkdir -p /app/persistent

# Set up volume for persistent data
VOLUME ["/app/persistent"]

# Environment variables
ENV NODE_ENV=production

# Expose web interface port
EXPOSE 3000

# Run the application
CMD ["node", "dist/index.js"]
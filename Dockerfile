FROM node:22-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package configuration files
COPY package.json yarn.lock tsconfig.json ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy application source code
COPY src ./src

# Build TypeScript code
RUN yarn build:ts

# Expose backend port
EXPOSE 5000

# Set environment variables for production
ENV PORT=5000
ENV FASTIFY_ADDRESS=0.0.0.0
ENV NODE_ENV=production

# Start command
CMD ["yarn", "fastify", "start", "-l", "info", "-p", "5000", "-a", "0.0.0.0", "dist/app.js"]

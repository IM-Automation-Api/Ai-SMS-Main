# Stage 1: Dependencies
FROM node:18-slim AS deps
WORKDIR /usr/src/app
COPY package*.json ./
# Install dependencies only (no devDependencies)
RUN npm ci --only=production

# Stage 2: Build
FROM node:18-slim AS builder
WORKDIR /usr/src/app
# Copy package files and install all dependencies (including dev)
COPY package*.json ./
RUN npm ci
# Copy source code
COPY . .
# If you have a build step, uncomment the following line
# RUN npm run build

# Stage 3: Runtime
FROM node:18-alpine AS runtime
WORKDIR /usr/src/app
# Set NODE_ENV
ENV NODE_ENV production
# Copy package files
COPY package*.json ./
# Copy dependencies from deps stage
COPY --from=deps /usr/src/app/node_modules ./node_modules
# Copy application code (or built assets if you have a build step)
COPY --from=builder /usr/src/app/index.js ./
COPY --from=builder /usr/src/app/supabase_schema.sql ./
# If you have a build output directory, use something like:
# COPY --from=builder /usr/src/app/dist ./dist

# Expose the port
EXPOSE 3000
# Run the application
CMD ["node", "index.js"]

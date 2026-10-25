FROM oven/bun:1.1-alpine

WORKDIR /app

# Copy dependency files first for layer caching
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY scripts/ ./scripts/
COPY src/onchain-facts.ts ./src/
COPY src/onchain-money.ts ./src/
COPY src/onchain-wait.ts ./src/
COPY tsconfig.json ./

# Run the reporter (no HTTP port -- pure background worker)
CMD ["bun", "run", "scripts/reporter.ts"]

FROM oven/bun:1.2-alpine

WORKDIR /app

# Copy package.json first for layer caching
COPY package.json ./
RUN bun install --production

# Copy source
COPY scripts/ ./scripts/
COPY src/onchain-facts.ts ./src/
COPY src/onchain-money.ts ./src/
COPY src/onchain-wait.ts ./src/
COPY tsconfig.json ./

# Run the reporter (no HTTP port -- pure background worker)
CMD ["bun", "run", "scripts/reporter.ts"]

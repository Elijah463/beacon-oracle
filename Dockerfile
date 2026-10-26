FROM oven/bun:1.2-alpine

WORKDIR /app

# Copy package.json first for layer caching
COPY package.json ./
RUN bun install --production

# Copy source files needed by the reporter
COPY scripts/ ./scripts/
COPY src/onchain-facts.ts ./src/
COPY src/onchain-money.ts ./src/
COPY src/onchain-wait.ts ./src/
COPY tsconfig.json ./

# Expose health server port
EXPOSE 8080

# Run the reporter
CMD ["bun", "run", "scripts/reporter.ts"]

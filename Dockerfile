# ─────────────────────────────────────────────────────────────────────────────
# Development image for the Chats Next.js app
# Usage: docker compose up
#
# In docker compose the source tree is bind-mounted over /app so changes on
# the host are immediately reflected (hot reload). The node_modules directory
# is kept as an anonymous volume so the container's native modules are used
# instead of anything installed on the host machine.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine

# sqlite3 CLI — used by docker-entrypoint.sh to apply raw SQL migrations
# (FTS5 virtual tables and triggers that drizzle-kit push cannot create)
RUN apk add --no-cache sqlite

WORKDIR /app

# Install dependencies first (separate layer for better caching).
COPY package*.json ./
RUN npm ci

# Copy source. In docker compose this layer is overridden by the bind mount,
# but it is still useful for standalone `docker run` and CI image builds.
COPY . .

EXPOSE 3000

# The entrypoint applies schema migrations and then starts the dev server.
ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]

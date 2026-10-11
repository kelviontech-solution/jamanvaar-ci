# Build from the repository root; runtime installs only API production dependencies.
FROM node:24-alpine AS builder
WORKDIR /repo
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY cloud/api ./cloud/api
RUN npm ci
RUN npm run build --workspace=@jamanvaar/cloud-api

FROM node:24-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY cloud/api/package.json ./cloud/api/package.json
# Prisma CLI is an explicit runtime dependency for the migration entrypoint.
# Tests, compilers, frontend packages and TS source stay out of the runtime image.
RUN npm ci --workspace=@jamanvaar/cloud-api --include-workspace-root=false --omit=dev --ignore-scripts
COPY --from=builder /repo/cloud/api/dist ./cloud/api/dist
COPY --from=builder /repo/cloud/api/prisma/schema.prisma ./cloud/api/prisma/schema.prisma
COPY --from=builder /repo/cloud/api/prisma/migrations ./cloud/api/prisma/migrations
COPY --from=builder /repo/node_modules/.prisma ./node_modules/.prisma
# --ignore-scripts intentionally skips engine downloads in the runtime stage. Preserve
# the builder's platform-matched schema engine so migrations need no runtime download.
COPY --from=builder /repo/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY cloud/api/entrypoint.sh ./cloud/api/entrypoint.sh
WORKDIR /repo/cloud/api
RUN sed -i 's/\r$//' entrypoint.sh && chmod +x entrypoint.sh \
    && mkdir -p uploads backups /data/backups && chown -R node:node uploads backups /data/backups
# Mounted storage must also be writable by UID 1000 on the deployment host.
USER node
EXPOSE 4000
ENTRYPOINT ["./entrypoint.sh"]

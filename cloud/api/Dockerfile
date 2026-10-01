# Build context is the REPO ROOT (see docker-compose.yml's `context: .`), not this
# directory -- cloud/api is one workspace inside an npm-workspaces monorepo, and `npm ci`
# needs the root package.json/package-lock.json to resolve it correctly, exactly the way
# local dev already does. Keeping devDependencies in the final image (not a slimmer
# `--omit=dev` prune) is a deliberate choice for this first deployment: `prisma` the CLI
# (needed at container start for `prisma migrate deploy`) is a devDependency, and getting
# a workspace-aware prod-only prune exactly right on the first real deploy is a smaller
# win than just shipping what's already proven to work in every dev/test run this
# session. Revisit once this is live and stable.

FROM node:24-alpine AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
# The whole cloud/api directory, not just its package.json, BEFORE `npm ci` -- its own
# `postinstall` script (`prisma generate`) runs as part of `npm ci` itself and needs
# cloud/api/prisma/schema.prisma to already be on disk at that point. Confirmed by actually
# reproducing the failure with only package.json copied first, not assumed: `npm ci` itself
# tolerates other workspaces (apps/*, packages/*, cloud/super-admin-web) being entirely
# absent just fine -- cloud/api has no dependency on any of them (confirmed: no @jamanvaar/*
# entries in its package.json) -- so only cloud/api itself needs to be present this early.
COPY cloud/api ./cloud/api
RUN npm ci

RUN npm run build --workspace=@jamanvaar/cloud-api

FROM node:24-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production

# node_modules (incl. the Prisma CLI) and the compiled app, straight from the builder --
# no second `npm ci`, so the image can never drift from what was actually built and tested.
# Only what's needed to run: the compiled dist/, the Prisma schema + migrations (needed by
# `prisma migrate deploy` at container start), and package.json -- not src/, test/, or any
# other dev-time-only file.
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/package.json /repo/package-lock.json ./
COPY --from=builder /repo/cloud/api/dist ./cloud/api/dist
COPY --from=builder /repo/cloud/api/prisma ./cloud/api/prisma
COPY --from=builder /repo/cloud/api/package.json ./cloud/api/package.json
COPY cloud/api/entrypoint.sh ./cloud/api/entrypoint.sh

WORKDIR /repo/cloud/api
RUN sed -i 's/\r$//' entrypoint.sh && chmod +x entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["./entrypoint.sh"]

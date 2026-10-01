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

# Prisma's engine binaries dynamically link against libssl and need `openssl` on the PATH to
# correctly detect which OpenSSL ABI they're running against. Alpine 3.24 (this image's base)
# ships OpenSSL 3.x (libssl.so.3) with no compat symlink for 1.1 -- without this package,
# detection silently fails ("Prisma failed to detect the libssl/openssl version to use ...
# Defaulting to openssl-1.1.x"), `prisma generate` picks the wrong engine binary (built for
# 1.1, not 3.x), and every `prisma` invocation later breaks with a non-JSON engine response
# ("Could not parse schema engine response"). Confirmed on the real deploy, not assumed: the
# container had libssl.so.3 present the whole time, just under a SONAME Prisma's
# wrongly-selected engine never asked for.
RUN apk add --no-cache openssl

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

# Same reason as the builder stage above: `prisma migrate deploy` runs in THIS stage at
# container start (see entrypoint.sh), against this stage's own Alpine base, independently
# of whatever the builder stage had.
RUN apk add --no-cache openssl

# node_modules (incl. the Prisma CLI and ts-node) and the compiled app, straight from the
# builder -- no second `npm ci`, so the image can never drift from what was actually built
# and tested. The compiled dist/ runs the real server; src/ + tsconfig.json below are only
# for `npm run seed` (ts-node against source, see its own comment below) -- test/ is still
# left out, nothing here runs it.
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/package.json /repo/package-lock.json ./
COPY --from=builder /repo/cloud/api/dist ./cloud/api/dist
COPY --from=builder /repo/cloud/api/prisma ./cloud/api/prisma
COPY --from=builder /repo/cloud/api/package.json ./cloud/api/package.json
# `npm run seed` runs `ts-node prisma/seed.ts` directly against TypeScript SOURCE, not the
# compiled dist/ -- found on the real deploy, not assumed: seed.ts imports
# ../src/config/seed-options, which doesn't exist anywhere in this image without src/ and a
# tsconfig.json for ts-node to resolve compilerOptions from. dist/ alone is enough to run the
# compiled app (`node dist/src/main.js`) but not enough to run this one TS-source script.
COPY --from=builder /repo/cloud/api/src ./cloud/api/src
COPY --from=builder /repo/cloud/api/tsconfig.json ./cloud/api/tsconfig.json
COPY cloud/api/entrypoint.sh ./cloud/api/entrypoint.sh

WORKDIR /repo/cloud/api
RUN sed -i 's/\r$//' entrypoint.sh && chmod +x entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["./entrypoint.sh"]

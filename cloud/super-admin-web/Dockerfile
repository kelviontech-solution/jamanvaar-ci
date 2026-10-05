# Build context is the REPO ROOT (see docker-compose.yml), not this directory. Copies the
# WHOLE repo (minus .dockerignore's exclusions -- node_modules, dist, Rust target/, .git,
# env files) before `npm ci`, not a cherry-picked subset. Two real, successive failures on
# the actual deploy proved cherry-picking wrong for this workspace specifically, not
# assumed up front:
#   1. super-admin-web/tsconfig.json extends the ROOT tsconfig.json for jsx/paths/strict --
#      missing it doesn't error, it silently falls back to tsc's bare defaults, failing
#      every .tsx file with "Cannot use JSX unless the '--jsx' flag is provided."
#   2. Its own tsconfig.json's `include` is `["src", "../../packages/**/*"]` -- the ENTIRE
#      packages/ tree, not just the @jamanvaar/* aliases this workspace's own code happens
#      to import. That sweeps in packages/api/src/print_transport.ts (needs
#      @tauri-apps/api, a Tauri-app-only dependency this workspace never declares) and
#      src/__tests__/access-parity.test.ts (a deliberate relative import of
#      ../../../api/src/common/rbac/access.ts -- an intentional frontend/backend RBAC
#      parity check, not a mistake to work around). cloud/api has no Tauri dependency
#      itself; the real fix is giving this build enough of the monorepo for both to
#      resolve, same as local dev already has, not narrowing what gets type-checked.
# Correctness over build-context size for this first deployment, same tradeoff already
# made for the backend's full node_modules in its own Dockerfile.

FROM node:24-alpine AS builder
WORKDIR /repo

COPY . .
RUN npm ci

# Relative (not absolute) so the built SPA calls same-origin /api/v1/... paths -- this
# container's own nginx below proxies those to the backend container. See
# src/api/client.ts: API_BASE is prefixed directly onto a path that already starts with
# /api/v1, so this must stay empty, not /api/v1 (that would double the prefix).
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
# Empty on production (this console owns the domain root there); set to e.g. "/admin" on
# a dedicated testing box serving every app by path under one origin -- see
# nginx/oracle-testing-proxy.conf and vite.config.ts's own comment on the relative base
# this pairs with.
ARG VITE_ROUTER_BASENAME=""
ENV VITE_ROUTER_BASENAME=$VITE_ROUTER_BASENAME
RUN npm run build --workspace=@jamanvaar/super-admin-web

FROM nginx:1.25-alpine AS runner
COPY cloud/super-admin-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/cloud/super-admin-web/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

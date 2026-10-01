# Build context is the REPO ROOT (see docker-compose.yml), not this directory --
# super-admin-web's vite.config.ts aliases @jamanvaar/{config,types,utils,i18n,validation,
# business,database,api,sync,ui} straight onto ../../packages/*/src, and many source files
# actually import from most of those (confirmed by grepping src/, not assumed from the
# alias list alone) -- not as resolved npm workspace dependencies, so copying only one of
# them (as an earlier version of this file did, packages/ui alone, matching
# ProtectedLayout.tsx's own comment about avoiding that barrel's side effect) would make
# the build fail on every other file importing a sibling package. packages/ is ~35MB
# total; copying all of it is simpler and safer than cherry-picking.
# Copied whole, before `npm ci`, for the same reason: several packages/* directories are
# themselves real npm workspace members (their own package.json) that package-lock.json's
# resolution expects to find present.

FROM node:24-alpine AS builder
WORKDIR /repo

# tsconfig.json too, not just package.json -- cloud/super-admin-web/tsconfig.json extends
# this ROOT file (`"extends": "../../tsconfig.json"`) for its jsx/paths/strict settings.
# Missing it doesn't fail the copy or npm ci, it fails LATER, silently falling back to
# tsc's bare defaults (no jsx flag at all) -- reproduced for real on the actual deploy, not
# assumed: `tsc --noEmit` errored on every single .tsx file with
# "Cannot use JSX unless the '--jsx' flag is provided."
COPY package.json package-lock.json tsconfig.json ./
COPY packages ./packages
COPY cloud/super-admin-web/package.json cloud/super-admin-web/package.json
RUN npm ci

COPY cloud/super-admin-web ./cloud/super-admin-web

# Relative (not absolute) so the built SPA calls same-origin /api/v1/... paths -- this
# container's own nginx below proxies those to the backend container. See
# src/api/client.ts: API_BASE is prefixed directly onto a path that already starts with
# /api/v1, so this must stay empty, not /api/v1 (that would double the prefix).
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build --workspace=@jamanvaar/super-admin-web

FROM nginx:1.25-alpine AS runner
COPY cloud/super-admin-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/cloud/super-admin-web/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

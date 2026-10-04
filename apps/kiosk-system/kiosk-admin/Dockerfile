# Same whole-repo build context / npm-workspaces pattern as cloud/super-admin-web's own
# Dockerfile (see that file for the full reasoning) -- this is a Vite/React workspace app
# with the same packages/* alias dependencies, so it needs the same whole-repo npm ci.

FROM node:24-alpine AS builder
WORKDIR /repo

COPY . .
RUN npm ci

# Baked in at build time -- unlike super-admin-web, this app calls an ABSOLUTE API host
# (see src/cloud/cloudClient.ts: API_BASE = import.meta.env.VITE_CLOUD_API_BASE_URL ??
# 'http://localhost:4000'), not a same-origin relative path, because it's built to run as a
# real terminal app potentially on a different network than the API. Point it at this box's
# own public origin so the browser's fetches stay same-origin (no CORS) once the shared
# proxy container in front of every app on this host is in place.
ARG VITE_CLOUD_API_BASE_URL=""
ENV VITE_CLOUD_API_BASE_URL=$VITE_CLOUD_API_BASE_URL
ARG VITE_BRANCH_CORE_URL=""
ENV VITE_BRANCH_CORE_URL=$VITE_BRANCH_CORE_URL
RUN npm run build --workspace=@jamanvaar/kiosk-admin

FROM nginx:1.25-alpine AS runner
COPY apps/kiosk-system/kiosk-admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/kiosk-system/kiosk-admin/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

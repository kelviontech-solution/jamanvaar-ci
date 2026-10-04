# Same whole-repo build context / npm-workspaces pattern as cloud/super-admin-web's own
# Dockerfile -- this is a Vite/React workspace app with the same packages/* alias
# dependencies, so it needs the same whole-repo npm ci.

FROM node:24-alpine AS builder
WORKDIR /repo

COPY . .
RUN npm ci

# Baked in at build time -- unlike super-admin-web, this app calls an ABSOLUTE API host
# (see src/cloud/cloudClient.ts). Point it at this box's own public origin so the browser's
# fetches stay same-origin (no CORS) once the shared proxy container is in place.
ARG VITE_CLOUD_API_BASE_URL=""
ENV VITE_CLOUD_API_BASE_URL=$VITE_CLOUD_API_BASE_URL
ARG VITE_BRANCH_CORE_URL=""
ENV VITE_BRANCH_CORE_URL=$VITE_BRANCH_CORE_URL
# This app's LegacyGuestRedirect links out to the qr-guest app, hosted at this same origin's
# root (see nginx/oracle-testing-proxy.conf) -- not a subpath, so the value is just the bare
# origin, same as VITE_CLOUD_API_BASE_URL above.
ARG VITE_QR_ORDER_URL=""
ENV VITE_QR_ORDER_URL=$VITE_QR_ORDER_URL
RUN npm run build --workspace=@jamanvaar/pos-admin

FROM nginx:1.25-alpine AS runner
COPY apps/restaurant-system/pos-admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/restaurant-system/pos-admin/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# Same whole-repo build context / npm-workspaces pattern as cloud/super-admin-web's own
# Dockerfile -- qr-guest has no @jamanvaar/* workspace deps of its own (see its
# package.json), but it's still an npm-workspaces member, so `npm ci` needs the root
# package-lock.json present, same as every other app here.

FROM node:24-alpine AS builder
WORKDIR /repo

COPY . .
RUN npm ci

# Baked in at build time -- see src/api.ts: apiBase() reads VITE_CLOUD_API_BASE_URL, with NO
# built-in production default (an unset value means the ordering page refuses to call the
# API at all, by design -- "There is no built-in production default and none for a real
# restaurant."). Point it at this box's own public origin so the browser's fetches stay
# same-origin (no CORS) once the shared proxy container is in place.
ARG VITE_CLOUD_API_BASE_URL=""
ENV VITE_CLOUD_API_BASE_URL=$VITE_CLOUD_API_BASE_URL
RUN npm run build --workspace=@jamanvaar/qr-guest

FROM nginx:1.25-alpine AS runner
COPY apps/qr-guest/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/qr-guest/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

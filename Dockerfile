FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=proxy_ca,target=/tmp/proxy-ca.pem \
    if [ -s /tmp/proxy-ca.pem ]; then export NODE_EXTRA_CA_CERTS=/tmp/proxy-ca.pem; fi; \
    npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY tests ./tests
COPY assets/generated ./assets/generated
COPY scripts/check-assets.mjs ./scripts/check-assets.mjs
RUN npm run build

FROM nginx:1.28-alpine AS runtime
COPY --chmod=644 docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]

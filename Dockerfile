FROM node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914
ARG SOURCE_COMMIT=development
ENV SOURCE_COMMIT=${SOURCE_COMMIT}
LABEL org.opencontainers.image.revision=${SOURCE_COMMIT}
RUN apk add --no-cache python3 make g++
EXPOSE 8080
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN --network=none npm run lint && npm run typecheck && npm test && npm run build
CMD ["node", "out/index.js"]

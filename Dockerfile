FROM node:22-alpine
ARG SOURCE_COMMIT=development
ENV SOURCE_COMMIT=${SOURCE_COMMIT}
LABEL org.opencontainers.image.revision=${SOURCE_COMMIT}
RUN apk add --no-cache python3 make g++
EXPOSE 8080
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["node", "out/index.js"]

FROM node:22-alpine
RUN apk add --no-cache python3 make g++
EXPOSE 8080
WORKDIR /app
COPY package.json .
RUN npm i
COPY . .
# Build the TypeScript project
RUN npm run build
CMD ["node", "out/index.js"]

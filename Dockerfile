FROM node:22-alpine
EXPOSE 8080
WORKDIR /app
COPY package.json .
RUN npm i
COPY . .
# Build the TypeScript project
RUN npm run build
CMD ["node", "out/index.js"]

FROM node:20-alpine

WORKDIR /app

# 仅复制 server 依赖声明
COPY server/package*.json ./server/

RUN cd server && npm install --production

# 复制源码
COPY server ./server
COPY public ./public

# 确保运行时目录存在
RUN mkdir -p /app/server/uploads /app/server/data

EXPOSE 3000

CMD ["node", "server/app.js"]

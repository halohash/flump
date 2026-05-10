FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    qemu-system-x86 \
    qemu-utils \
    nodejs \
    npm

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

CMD ["node", "server.js"]

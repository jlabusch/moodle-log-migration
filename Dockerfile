FROM node:7.8-alpine

WORKDIR /opt

COPY package.json migration.js lib ./

RUN npm install

ENTRYPOINT ["node", "./migration.js"]

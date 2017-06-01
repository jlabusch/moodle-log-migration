FROM node:7.8-alpine

WORKDIR /opt

RUN mkdir -p /opt/data

COPY package.json ./

RUN npm install

ENTRYPOINT ["node", "--max-old-space-size=8192",  "./migration.js"]

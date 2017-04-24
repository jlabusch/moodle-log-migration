FROM node:7.8-alpine

WORKDIR /opt

RUN mkdir -p /opt/data

COPY .eslintrc.yml package.json migration.js lib ./

RUN npm install

ENTRYPOINT ["node", "./migration.js"]

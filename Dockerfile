FROM node:14 as builder
WORKDIR /workdir

COPY package.json yarn.lock ./
RUN yarn install

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN yarn build

# production images
FROM node:14-alpine

RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--", "node", "./dist/main.js"]

WORKDIR /workdir
COPY --from=builder /workdir .
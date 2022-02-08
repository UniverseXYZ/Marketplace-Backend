FROM node:14 as builder
WORKDIR /workdir

COPY package.json yarn.lock ./
RUN yarn install

COPY tsconfig.json tsconfig.build.json ormconfig.ts hardhat.config.ts ./
COPY src ./src
COPY migrations ./migrations
RUN yarn build

# production images
FROM node:14-alpine

RUN apk add --no-cache tini
# ENTRYPOINT ["/sbin/tini", "--", "node", "./dist/main.js"]
ENTRYPOINT ["sleep"]
CMD ["86400"]

WORKDIR /workdir
COPY --from=builder /workdir .
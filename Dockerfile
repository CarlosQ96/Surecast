FROM node:20-slim AS builder

RUN npm install -g pnpm@9

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/site/package.json packages/site/package.json
COPY packages/snap/package.json packages/snap/package.json

RUN pnpm install --frozen-lockfile

COPY . .

ARG SNAP_ORIGIN=npm:surecast-snap
ENV SNAP_ORIGIN=$SNAP_ORIGIN

RUN pnpm --filter site build

FROM node:20-slim

RUN npm install -g serve@14

WORKDIR /app
COPY --from=builder /app/packages/site/public ./public

ENV PORT=3000
EXPOSE 3000
CMD serve public -l $PORT -s

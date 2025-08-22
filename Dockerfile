FROM node:20-alpine

RUN npm install -g pnpm@10.11.0

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm db:generate

RUN pnpm build

CMD ["pnpm", "start"]

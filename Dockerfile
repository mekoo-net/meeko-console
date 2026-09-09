# meeko-console 静态产物镜像（Vue 3 + Vite）
# 纯静态 SPA：运行期不需要 Node.js，也不内置 Web 服务。
# 镜像只携带构建好的 dist/，启动时同步到挂载目录，由宿主/外部 Web 服务托管。
FROM node:22-alpine AS build
WORKDIR /app

# Vite 在构建期把 VITE_* 变量内联进产物，需在 build 之前注入
ARG VITE_API_BASE=https://api.meeko.top
ARG VITE_DEMUX_API_BASE=https://console.meeyo.org
ARG VITE_USE_MOCK=false

ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_DEMUX_API_BASE=$VITE_DEMUX_API_BASE \
    VITE_USE_MOCK=$VITE_USE_MOCK \
    NODE_ENV=production

# pnpm 版本以 package.json 的 packageManager 为准，corepack 按它拉取；devDependencies（vite/vue-tsc）构建期需要
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmrc ./
RUN corepack enable && pnpm install --frozen-lockfile --prod=false

COPY . .
RUN pnpm run build

# 运行阶段：极简镜像，仅存放静态产物，无任何常驻服务
FROM alpine:3.20 AS runtime

# 构建产物固定放在 /dist，可直接只读挂载到外部 Web 服务容器
COPY --from=build /app/dist /dist

# 默认行为：把 /dist 同步到挂载目录 /output 后退出
#   docker run --rm -v /srv/www/meeko-console:/output ghcr.io/<repo>/meeko-console:<tag>
# 也可直接挂载 /dist 给其它容器：
#   -v meeko-console-dist:/dist  或  --volumes-from
CMD ["sh", "-c", "mkdir -p /output && cp -a /dist/. /output/ && echo 'meeko-console dist -> /output done'"]

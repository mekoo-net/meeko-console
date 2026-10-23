# meeko-console（Vue 3 + Vite）
# Vite 在构建期把 VITE_* 内联进产物，运行期改环境变量不会生效。
# 镜像由 nginx 在 80 端口托管 dist/。Dokploy 前面的 Traefik 要有进程一直监听，
# 不能再「拷到 /output 后退出」。深层路径回落到 index.html，见 nginx.conf。
FROM node:22-alpine AS build
WORKDIR /app

# Vite 在构建期把 VITE_* 变量内联进产物，需在 build 之前注入
ARG VITE_API_BASE=https://api.meeko.top
ARG VITE_YOMI_API_BASE=https://api.meeyo.org
ARG VITE_USE_MOCK=false

ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_YOMI_API_BASE=$VITE_YOMI_API_BASE \
    VITE_USE_MOCK=$VITE_USE_MOCK \
    NODE_ENV=production

# pnpm 版本以 package.json 的 packageManager 为准，corepack 按它拉取；devDependencies（vite/vue-tsc）构建期需要
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmrc ./
RUN corepack enable && pnpm install --frozen-lockfile --prod=false

COPY . .
RUN pnpm run build

# 官方镜像的 CMD 是 nginx -g 'daemon off;'，前台运行，容器不会退出。
FROM nginx:1.30-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# syntax=docker/dockerfile:1
# Dev-server image: runs `vite` with HMR. (A prod build would be a multi-stage
# `vite build` → nginx; out of scope this step.)
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5173
# --host 0.0.0.0 so the dev server is reachable from outside the container.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

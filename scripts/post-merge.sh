#!/bin/bash
set -e
# Install all workspace packages except cst-driver (which pulls in react-native ->
# react-devtools-core -> shell-quote, a package blocked by Replit's package firewall)
pnpm install --no-frozen-lockfile --filter '!@workspace/cst-driver'
pnpm --filter db push
# Build API server
cd artifacts/api-server && node build.mjs && cd ../..
# Regenerate API client (React Query hooks + Zod schemas) from openapi.yaml
cd lib/api-spec && pnpm exec orval --config ./orval.config.ts && cd ../..
# Build frontends
cd artifacts/bizportal && pnpm run build && cd ../..
cd artifacts/customer-portal && pnpm run build && cd ../..
cd artifacts/logistic-order && pnpm run build && cd ../..

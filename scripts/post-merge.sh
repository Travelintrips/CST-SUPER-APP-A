#!/bin/bash
set -e
pnpm install
pnpm --filter db push
# Build API server
cd artifacts/api-server && node build.mjs && cd ../..
# Regenerate API client (React Query hooks + Zod schemas) from openapi.yaml
cd lib/api-spec && pnpm exec orval --config ./orval.config.ts && cd ../..
# Build frontends
cd artifacts/bizportal && pnpm run build && cd ../..
cd artifacts/customer-portal && pnpm run build && cd ../..
cd artifacts/logistic-order && pnpm run build && cd ../..

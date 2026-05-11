#!/usr/bin/env bash
# Avvia tutti i servizi BizPortal CST Logistics sulle porte corrette degli artifact
# Questo script viene eseguito automaticamente da "Start application" quando Replit si risveglia

# Avvia API Server in background (port 8080)
PORT=8080 pnpm --filter @workspace/api-server run dev &

# Avvia BizPortal ERP in background (port 18442)
PORT=18442 BASE_PATH=/bizportal/ pnpm --filter @workspace/bizportal run dev &

# Avvia Logistic Order in background (port 19368)
PORT=19368 BASE_PATH=/logistic-order/ pnpm --filter @workspace/logistic-order run dev &

# Avvia CST Driver (Expo) in background (port 21170)
PORT=21170 pnpm --filter @workspace/cst-driver run dev &

# Avvia Customer Portal in foreground (port 23434 - porta artifact)
PORT=23434 BASE_PATH=/ pnpm --filter @workspace/customer-portal run dev

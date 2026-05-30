#!/bin/bash
# Gateway only — artifact workflows (API Server, BizPortal, Customer Portal)
# are started separately by Replit's artifact runner.
fuser -k 5000/tcp 2>/dev/null || true
sleep 0.3
export BIZPORTAL_PORT=18442
export CUSTOMER_PORT=5173
export API_PORT=18444
export PORT=5000
exec node gateway.mjs

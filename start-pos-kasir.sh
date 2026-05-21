#!/usr/bin/env bash

echo "==> POS Kasir mode"
echo "==> /kasir/login tersedia via customer-portal artifact"
echo "==> API Server dihandle oleh workflow 'API Server' — tidak perlu start ulang di sini."

# Keep the workflow alive indefinitely
exec tail -f /dev/null

#!/bin/sh
# A failed migration must stop the container. set -e makes the script exit
# before the server starts.
set -e
/prisma-cli/node_modules/.bin/prisma migrate deploy --schema ./prisma/schema.prisma
exec node server.js

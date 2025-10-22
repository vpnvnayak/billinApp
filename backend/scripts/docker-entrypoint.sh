#!/bin/sh
set -e

echo "Running DB migrations..."
node ./scripts/migrate.js || echo "Migrations failed or already applied"

echo "Starting backend"
node src/index.js

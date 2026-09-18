#!/bin/sh
set -eu

manifest_hash_file="node_modules/.deps-manifest.sha256"
current_hash="$(cat package.json package-lock.json | sha256sum | awk '{print $1}')"
stored_hash=""

if [ -f "$manifest_hash_file" ]; then
  stored_hash="$(cat "$manifest_hash_file")"
fi

if [ ! -d node_modules ] || [ "$stored_hash" != "$current_hash" ]; then
  echo "Installing frontend dependencies..."
  npm ci
  mkdir -p node_modules
  printf '%s' "$current_hash" > "$manifest_hash_file"
fi

exec npm run dev -- --host 0.0.0.0
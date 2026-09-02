#!/usr/bin/env sh
set -eu

CERT_DIR="$(cd "$(dirname "$0")/../nginx/certs" && pwd)"
CRT_PATH="$CERT_DIR/localhost.crt"
KEY_PATH="$CERT_DIR/localhost.key"

mkdir -p "$CERT_DIR"

openssl req -x509 -nodes -newkey rsa:4096 \
  -keyout "$KEY_PATH" \
  -out "$CRT_PATH" \
  -days 365 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

echo "Generated:"
echo "  $CRT_PATH"
echo "  $KEY_PATH"

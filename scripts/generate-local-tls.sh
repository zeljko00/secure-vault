#!/usr/bin/env sh
set -eu

CERT_DIR="$(cd "$(dirname "$0")/../nginx/certs" && pwd)"
CRT_PATH="$CERT_DIR/proxy.crt"
KEY_PATH="$CERT_DIR/proxy.key"
CERT_COMMON_NAME="${CERT_COMMON_NAME:-localhost}"
HOSTNAME_VALUE="secure-vault"
PRIMARY_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

SAN="DNS:localhost,IP:127.0.0.1,DNS:$HOSTNAME_VALUE"

if [ -n "$PRIMARY_IP" ]; then
  SAN="$SAN,IP:$PRIMARY_IP"
fi

if [ -n "${EXTRA_DNS:-}" ]; then
  for dns in $(printf '%s' "$EXTRA_DNS" | tr ',' ' '); do
    SAN="$SAN,DNS:$dns"
  done
fi

if [ -n "${EXTRA_IPS:-}" ]; then
  for ip in $(printf '%s' "$EXTRA_IPS" | tr ',' ' '); do
    SAN="$SAN,IP:$ip"
  done
fi

mkdir -p "$CERT_DIR"

openssl req -x509 -nodes -newkey rsa:4096 \
  -keyout "$KEY_PATH" \
  -out "$CRT_PATH" \
  -days 365 \
  -subj "/CN=$CERT_COMMON_NAME" \
  -addext "subjectAltName=$SAN"

echo "Generated:"
echo "  $CRT_PATH"
echo "  $KEY_PATH"
echo "  subjectAltName=$SAN"

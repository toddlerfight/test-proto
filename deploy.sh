#!/usr/bin/env bash
# Ship it. No git on the box, so rsync over SSH like it's 2009.
set -euo pipefail

HOST="ubuntu@15.134.89.136"
KEY="$HOME/.ssh/tkf-v2.pem"
DEST="/var/www/test-proto"
SRC="$(cd "$(dirname "$0")" && pwd)"

rsync -avz --delete \
  --exclude '.git' --exclude 'deploy.sh' --exclude 'INSTRUCTIONS.md' \
  -e "ssh -i $KEY -o StrictHostKeyChecking=no" \
  "$SRC/" "$HOST:/tmp/test-proto/"

ssh -i "$KEY" -o StrictHostKeyChecking=no "$HOST" "
  sudo mkdir -p $DEST
  sudo rsync -a --delete /tmp/test-proto/ $DEST/
  sudo chown -R www-data:www-data $DEST
"

echo "Deployed to https://test.marcusg.co"

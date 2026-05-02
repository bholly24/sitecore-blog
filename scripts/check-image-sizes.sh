#!/usr/bin/env bash
set -euo pipefail

MAX_BYTES=204800

LARGE=$(find src -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" -o -iname "*.gif" \) | while read -r file; do
  size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file")
  if [ "$size" -gt "$MAX_BYTES" ]; then
    echo "  $file ($(( size / 1024 ))KB)"
  fi
done)

if [ -n "$LARGE" ]; then
  echo "Images over 200KB found. Resize before committing:"
  echo "$LARGE"
  exit 1
fi

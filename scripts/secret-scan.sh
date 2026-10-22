#!/usr/bin/env bash
# Fails when a provider key, the maintainer's personal identifiers or an e-mail address appears in a tracked file.
set -euo pipefail
pattern='sk-or-v1-[A-Za-z0-9]{20,}|sk_[A-Za-z0-9]{20,}|gmail\.com|matgus|gustafsson'
if git ls-files -z | grep -zv '^scripts/secret-scan\.sh$' | xargs -0 grep -EnI "$pattern"; then
  echo "secret scan: the matches above must not be committed" >&2
  exit 1
fi
echo "secret scan: clean"

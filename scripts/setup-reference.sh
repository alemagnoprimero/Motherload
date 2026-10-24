#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .cache/reference-tools reference
fetch_verified() {
  local url="$1" destination="$2" expected="$3"
  if ! test -f "$destination" || ! echo "$expected  $destination" | sha256sum --check --status; then
    curl --fail --location --retry 2 --max-time 120 "$url" -o "$destination.download"
    echo "$expected  $destination.download" | sha256sum --check
    mv "$destination.download" "$destination"
  fi
  echo "$expected  $destination" | sha256sum --check
}
fetch_verified 'https://files.crazygames.com/motherload/1/motherload_2017.swf' 'reference/motherload_2017.swf' '4d480aec3dde7de7e3da54a594398388fd3a03f71eefd63668a94ff015ed928d'
fetch_verified 'https://github.com/jindrapetrik/jpexs-decompiler/releases/download/version26.4.0/ffdec_26.4.0.zip' '.cache/reference-tools/ffdec_26.4.0.zip' '56ce960aeafc7caf034e2052ba49f878a883f7c7ca690da6eeffca9587b5e4b9'
python3 - <<'PY'
import zipfile
with zipfile.ZipFile('.cache/reference-tools/ffdec_26.4.0.zip') as z:
    z.extractall('.cache/reference-tools/jpexs')
PY
java -Djava.awt.headless=true -jar .cache/reference-tools/jpexs/ffdec.jar -export script reference/decompiled reference/motherload_2017.swf

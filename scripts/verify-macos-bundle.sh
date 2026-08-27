#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/Treq.app" >&2
  exit 2
fi

APP_BUNDLE="$1"
EXECUTABLE="$APP_BUNDLE/Contents/MacOS/treq"
DUCKDB_DYLIB="$APP_BUNDLE/Contents/Frameworks/libduckdb.dylib"
EXPECTED_RPATH="@executable_path/../Frameworks"

if [[ ! -f "$EXECUTABLE" ]]; then
  echo "Missing app executable: $EXECUTABLE" >&2
  exit 1
fi

if [[ ! -f "$DUCKDB_DYLIB" ]]; then
  echo "Missing bundled DuckDB library: $DUCKDB_DYLIB" >&2
  exit 1
fi

if ! otool -L "$EXECUTABLE" | grep -Fq '@rpath/libduckdb.dylib'; then
  echo "App executable does not link to @rpath/libduckdb.dylib" >&2
  exit 1
fi

if ! otool -l "$EXECUTABLE" | grep -A2 LC_RPATH | grep -Fq "$EXPECTED_RPATH"; then
  echo "App executable is missing LC_RPATH $EXPECTED_RPATH" >&2
  exit 1
fi

executable_archs="$(lipo -archs "$EXECUTABLE")"
duckdb_archs="$(lipo -archs "$DUCKDB_DYLIB")"
for arch in $executable_archs; do
  if [[ " $duckdb_archs " != *" $arch "* ]]; then
    echo "DuckDB architectures ($duckdb_archs) do not include executable architecture $arch" >&2
    exit 1
  fi
done

codesign --verify --deep --strict "$APP_BUNDLE"
echo "Verified macOS bundle: $APP_BUNDLE"

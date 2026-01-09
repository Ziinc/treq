#!/usr/bin/env bash
set -euo pipefail

# Configuration
CERTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_ARCH="${TARGET_ARCH:-$(uname -m)}"
TEMP_KEYCHAIN=""

# Parse arguments
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
  cat << 'EOF'
Usage: ./scripts/notarize-local.sh [--arch ARCH]

Build, code sign, and notarize Treq for macOS locally.

Options:
  --arch arm64|x64     Build for specific architecture (default: current)
  --help, -h          Show this help message

Examples:
  ./scripts/notarize-local.sh              # Build for current arch
  ./scripts/notarize-local.sh --arch arm64 # Build for Apple Silicon
  ./scripts/notarize-local.sh --arch x64   # Build for Intel

For setup instructions, see DEVELOPER.md
EOF
  exit 0
fi

if [[ "${1:-}" == "--arch" ]]; then
  TARGET_ARCH="$2"
fi

# Validate platform and tools
if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "Error: This script only works on macOS"
  exit 1
fi

command -v npm >/dev/null || {
  echo "Error: npm not found"
  exit 1
}

command -v cargo >/dev/null || {
  echo "Error: cargo not found"
  exit 1
}

# Check certificates
if [[ ! -f "$CERTS_DIR/certificate.p12" ]]; then
  echo "Error: Missing $CERTS_DIR/certificate.p12"
  echo "See DEVELOPER.md for setup instructions"
  exit 1
fi

env_file="$CERTS_DIR/.env.prod"
if [[ ! -f "$env_file" ]]; then
  env_file="$CERTS_DIR/.env"
fi

if [[ ! -f "$env_file" ]]; then
  echo "Error: Missing $CERTS_DIR/.env or $CERTS_DIR/.env.prod"
  echo "See DEVELOPER.md for setup instructions"
  exit 1
fi

# Load environment variables
source "$env_file"

# Cleanup function
cleanup() {
  if [[ -n "$TEMP_KEYCHAIN" ]]; then
    security delete-keychain "$TEMP_KEYCHAIN" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Create temporary keychain and import certificate
echo "Setting up keychain..."
TEMP_KEYCHAIN="treq-build-$(uuidgen).keychain"
KEYCHAIN_PASSWORD=$(uuidgen)

security create-keychain -p "$KEYCHAIN_PASSWORD" "$TEMP_KEYCHAIN"
security default-keychain -s "$TEMP_KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$TEMP_KEYCHAIN"
security set-keychain-settings -t 3600 -u "$TEMP_KEYCHAIN"

echo "Importing certificate..."
security import "$CERTS_DIR/certificate.p12" \
  -k "$TEMP_KEYCHAIN" \
  -P "$APPLE_CERTIFICATE_PASSWORD" \
  -T /usr/bin/codesign

security set-key-partition-list -S apple-tool:,apple:,codesign: \
  -s -k "$KEYCHAIN_PASSWORD" "$TEMP_KEYCHAIN"

# Map architecture to Tauri target
case "$TARGET_ARCH" in
  arm64|aarch64)
    TAURI_TARGET="aarch64-apple-darwin"
    ;;
  x64|x86_64)
    TAURI_TARGET="x86_64-apple-darwin"
    ;;
  *)
    echo "Error: Unknown architecture $TARGET_ARCH"
    exit 1
    ;;
esac

# Build
echo "Building frontend..."
cd "$PROJECT_ROOT"
npm run build

echo "Building and signing Tauri app for $TAURI_TARGET..."
npm run tauri build -- --target "$TAURI_TARGET"

echo ""
echo "Build complete!"
echo "Output: src-tauri/target/release/bundle/macos/"

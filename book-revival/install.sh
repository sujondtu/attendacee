#!/usr/bin/env bash
#
# install.sh - Install the system tools the revive.py pipeline needs.
#
# Detects your platform and installs:
#   ocrmypdf, tesseract-ocr, poppler-utils, ghostscript, imagemagick
#
# Usage:  ./install.sh
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Fallback: pip/venv install of the Python side (ocrmypdf + pikepdf).
# Use this if your system packages are broken/old, e.g.
#     ./install.sh --venv
# You STILL need the system binaries tesseract, poppler and ghostscript
# (this script installs those first). ocrmypdf/pikepdf then come from PyPI in
# an isolated venv, avoiding version clashes with distro packages.
# ---------------------------------------------------------------------------
install_venv() {
  echo "==> Creating isolated Python env in ./venv with ocrmypdf from PyPI…"
  python3 -m venv venv
  ./venv/bin/pip install --upgrade pip >/dev/null
  ./venv/bin/pip install ocrmypdf pymupdf
  echo ""
  echo "==> venv ready. Run the pipeline through it, e.g.:"
  echo "    ./venv/bin/python revive.py all book.pdf --out build/"
  echo "  (Make sure tesseract/poppler/ghostscript are on PATH — installed above.)"
}

echo "==> Detecting platform…"

install_debian() {
  echo "==> Debian/Ubuntu detected. Installing with apt…"
  sudo apt-get update
  sudo apt-get install -y \
    ocrmypdf \
    tesseract-ocr \
    poppler-utils \
    ghostscript \
    imagemagick \
    pngquant \
    unpaper
  echo "==> Extra Tesseract languages: apt-get install tesseract-ocr-<lang>  (e.g. -deu)"
}

install_mac() {
  echo "==> macOS detected. Installing with Homebrew…"
  if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew not found. Install it from https://brew.sh first." >&2
    exit 1
  fi
  brew install ocrmypdf tesseract poppler ghostscript imagemagick pngquant
  echo "==> Extra Tesseract languages: brew install tesseract-lang"
}

install_fedora() {
  echo "==> Fedora/RHEL detected. Installing with dnf…"
  sudo dnf install -y ocrmypdf tesseract poppler-utils ghostscript ImageMagick pngquant
}

if [ "$(uname)" = "Darwin" ]; then
  install_mac
elif [ -f /etc/debian_version ]; then
  install_debian
elif [ -f /etc/fedora-release ] || [ -f /etc/redhat-release ]; then
  install_fedora
else
  echo "Unsupported platform. Please install these manually:" >&2
  echo "  ocrmypdf tesseract poppler-utils ghostscript imagemagick" >&2
  exit 1
fi

if [ "${1:-}" = "--venv" ]; then
  install_venv
fi

echo ""
echo "==> Done. Verify with:  python3 revive.py doctor"
echo "    If ocrmypdf/pikepdf fail to import, re-run:  ./install.sh --venv"

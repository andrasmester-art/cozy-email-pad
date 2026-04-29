#!/usr/bin/env bash
# =============================================================================
#  MepodMail — Frissítő (dupla kattintásra futtatható)
# -----------------------------------------------------------------------------
#  Használat:
#    1. Töltsd le a repó ZIP-jét a GitHub-ról (Code → Download ZIP)
#    2. Csomagold ki bárhova (pl. Letöltések)
#    3. Dupla kattintás erre a fájlra a Finderben
#
#  Mit csinál:
#    - Telepíti a függőségeket (npm install)
#    - Buildeli a frontendet (vite)
#    - Csomagol egy friss .app-ot (@electron/packager)
#    - Bezárja a futó MepodMail-t
#    - Lecseréli az /Applications/MepodMail.app-ot
#    - Elindítja az új verziót
# =============================================================================

set -euo pipefail

# A script a repó gyökerében van — váltsunk ide
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

APP_NAME="MepodMail"
APPLICATIONS_DIR="/Applications"

# ---- Színes log ------------------------------------------------------------
log()  { printf "\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "\033[1;32m✓ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m! %s\033[0m\n" "$*"; }
err()  { printf "\033[1;31m✗ %s\033[0m\n" "$*" >&2; }

trap 'err "Hiba történt a frissítés közben. Görgess fel a részletekért."; echo; read -n 1 -s -r -p "Nyomj egy gombot a bezáráshoz..."' ERR

echo
echo "============================================================"
echo "   MepodMail frissítő — $(date '+%Y-%m-%d %H:%M')"
echo "============================================================"
echo

# ---- macOS check -----------------------------------------------------------
if [[ "$(uname -s)" != "Darwin" ]]; then
  err "Ez a script csak macOS-en fut."
  exit 1
fi

# ---- Architektúra ----------------------------------------------------------
case "$(uname -m)" in
  arm64)  ARCH="arm64" ;;
  x86_64) ARCH="x64"   ;;
  *)      err "Ismeretlen architektúra: $(uname -m)"; exit 1 ;;
esac
log "Architektúra: darwin-$ARCH"

# ---- Előfeltételek (node) --------------------------------------------------
if ! command -v node >/dev/null; then
  err "A Node.js nincs telepítve."
  echo "   Telepítsd: https://nodejs.org/  vagy  brew install node"
  echo
  read -n 1 -s -r -p "Nyomj egy gombot a bezáráshoz..."
  exit 1
fi
log "Node verzió: $(node -v)"

# ---- 1) Függőségek + build ------------------------------------------------
log "npm install… (eltarthat 1-3 percig)"
npm install --no-audit --no-fund

if ! npm ls electron >/dev/null 2>&1 || ! npm ls @electron/packager >/dev/null 2>&1; then
  log "Electron + @electron/packager telepítése…"
  npm install --save-dev electron @electron/packager --no-audit --no-fund
fi

log "Vite build…"
npx vite build
ok "Frontend build kész."

# ---- 2) .app csomagolás ----------------------------------------------------
OUT_DIR="electron-release"
PKG_DIR="$OUT_DIR/$APP_NAME-darwin-$ARCH"
APP_PATH="$PKG_DIR/$APP_NAME.app"

log "Electron csomagolás…"
rm -rf "$PKG_DIR"
npx @electron/packager . "$APP_NAME" \
  --platform=darwin \
  --arch="$ARCH" \
  --out="$OUT_DIR" \
  --overwrite \
  --ignore='^/src' \
  --ignore='^/public' \
  --ignore='^/scripts' \
  --ignore="^/$OUT_DIR"

if [[ ! -d "$APP_PATH" ]]; then
  err "Nem készült el: $APP_PATH"
  exit 1
fi
ok ".app elkészült."

# ---- 3) Futó példány bezárása ---------------------------------------------
log "Futó $APP_NAME bezárása (ha nyitva van)…"
osascript -e "tell application \"$APP_NAME\" to quit" >/dev/null 2>&1 || true
for i in 1 2 3 4 5; do
  pgrep -x "$APP_NAME" >/dev/null || break
  sleep 1
done
pgrep -x "$APP_NAME" >/dev/null && pkill -x "$APP_NAME" || true

# ---- 4) Telepítés /Applications-be ----------------------------------------
DEST="$APPLICATIONS_DIR/$APP_NAME.app"
warn "Az /Applications írásához macOS jelszót kérhet a Terminál."

if [[ -d "$DEST" ]]; then
  log "Régi verzió eltávolítása…"
  if ! rm -rf "$DEST" 2>/dev/null; then
    sudo rm -rf "$DEST"
  fi
fi

log "Új verzió másolása az /Applications-be…"
if ! cp -R "$APP_PATH" "$APPLICATIONS_DIR/" 2>/dev/null; then
  sudo cp -R "$APP_PATH" "$APPLICATIONS_DIR/"
fi

# Gatekeeper karantén feloldás (különben "sérült" hibát adhat)
xattr -cr "$DEST" 2>/dev/null || sudo xattr -cr "$DEST" 2>/dev/null || true

ok "Telepítve: $DEST"

# ---- 5) Indítás ------------------------------------------------------------
log "Indítás…"
open "$DEST"

echo
echo "============================================================"
ok "Frissítés kész! 🎉  Fut a legfrissebb $APP_NAME."
echo "   Adataid (fiókok, piszkozatok, aláírások) megmaradtak."
echo "============================================================"
echo
read -n 1 -s -r -p "Nyomj egy gombot az ablak bezárásához..."
echo

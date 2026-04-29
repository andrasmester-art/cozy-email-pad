#!/usr/bin/env bash
# =============================================================================
#  MepodMail — egy parancsos macOS frissítő
# -----------------------------------------------------------------------------
#  Mit csinál:
#    1. Lehúzza a legfrissebb kódot a GitHub repóból (klónozza, ha még nincs).
#    2. Telepíti a függőségeket, buildeli a frontendet (vite).
#    3. @electron/packager-rel csomagol egy friss .app-ot (auto arch detektálás).
#    4. Bezárja a futó MepodMail példányt, lecseréli az /Applications/-ban,
#       feloldja a Gatekeeper karantént, és elindítja az új verziót.
#
#  Használat (Mac Terminálban):
#    curl -fsSL https://raw.githubusercontent.com/andrasmester-art/cozy-email-pad/main/scripts/update-mac.sh | bash
#  vagy ha már van klónod:
#    chmod +x scripts/update-mac.sh && ./scripts/update-mac.sh
#
#  Opcionális env változók:
#    WORKDIR=~/Developer/cozy-email-pad   # hova klónozzon (default: ~/cozy-email-pad)
#    ARCH=x64                              # Intel Mac-en kényszerítés
#    BRANCH=main                           # másik branch
#    SKIP_INSTALL_TO_APPLICATIONS=1        # csak buildelés, ne másolja ki
# =============================================================================

set -euo pipefail

REPO_URL="https://github.com/andrasmester-art/cozy-email-pad.git"
APP_NAME="MepodMail"
BRANCH="${BRANCH:-main}"
WORKDIR="${WORKDIR:-$HOME/cozy-email-pad}"
APPLICATIONS_DIR="${APPLICATIONS_DIR:-/Applications}"

# ---- Színes log ------------------------------------------------------------
log()  { printf "\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "\033[1;32m✓ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m! %s\033[0m\n" "$*"; }
err()  { printf "\033[1;31m✗ %s\033[0m\n" "$*" >&2; }

# ---- Csak macOS ------------------------------------------------------------
if [[ "$(uname -s)" != "Darwin" ]]; then
  err "Ez a script kizárólag macOS-en fut. Linux/Windows esetén használd a scripts/update-app.sh-t."
  exit 1
fi

# ---- Architektúra detektálás ----------------------------------------------
if [[ -z "${ARCH:-}" ]]; then
  case "$(uname -m)" in
    arm64)  ARCH="arm64" ;;
    x86_64) ARCH="x64"   ;;
    *)      err "Ismeretlen architektúra: $(uname -m)"; exit 1 ;;
  esac
fi
log "Cél architektúra: darwin-$ARCH"

# ---- Előfeltételek ---------------------------------------------------------
need_brew=()
command -v git  >/dev/null || need_brew+=(git)
command -v node >/dev/null || need_brew+=(node)
if (( ${#need_brew[@]} > 0 )); then
  warn "Hiányzó eszközök: ${need_brew[*]}"
  if command -v brew >/dev/null; then
    log "Telepítés Homebrew-val…"
    brew install "${need_brew[@]}"
  else
    err "Telepítsd a Homebrew-t (https://brew.sh), majd: brew install ${need_brew[*]}"
    exit 1
  fi
fi

# ---- 1) Forrás megszerzése / frissítése -----------------------------------
if [[ -d "$WORKDIR/.git" ]]; then
  log "Repo frissítése: $WORKDIR"
  cd "$WORKDIR"
  if ! git diff --quiet || ! git diff --cached --quiet; then
    warn "Helyi módosítások — stash-be mentem őket."
    git stash push -u -m "update-mac.sh autostash $(date +%s)" || true
  fi
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
else
  log "Klónozás: $WORKDIR"
  mkdir -p "$(dirname "$WORKDIR")"
  git clone --branch "$BRANCH" "$REPO_URL" "$WORKDIR"
  cd "$WORKDIR"
fi
ok "Forrás verzió: $(git rev-parse --short HEAD)"

# ---- 2) Függőségek + build ------------------------------------------------
log "npm install…"
npm install --no-audit --no-fund

if ! npm ls electron >/dev/null 2>&1 || ! npm ls @electron/packager >/dev/null 2>&1; then
  log "Electron + @electron/packager telepítése…"
  npm install --save-dev electron @electron/packager --no-audit --no-fund
fi

log "Vite build…"
npx vite build
ok "Frontend build kész."

# ---- 3) .app csomagolás ----------------------------------------------------
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
ok ".app elkészült: $APP_PATH"

# ---- 4) Telepítés az Applications mappába ---------------------------------
if [[ "${SKIP_INSTALL_TO_APPLICATIONS:-0}" == "1" ]]; then
  warn "SKIP_INSTALL_TO_APPLICATIONS=1 — kihagyom a kicserélést."
  ok "Manuális telepítés:  cp -R \"$APP_PATH\" \"$APPLICATIONS_DIR/\""
  exit 0
fi

mkdir -p "$APPLICATIONS_DIR"

log "Futó $APP_NAME bezárása (ha nyitva van)…"
osascript -e "tell application \"$APP_NAME\" to quit" >/dev/null 2>&1 || true
# Várunk pár másodpercet, hogy a folyamat ténylegesen lelépjen
for i in 1 2 3 4 5; do
  pgrep -x "$APP_NAME" >/dev/null || break
  sleep 1
done
pgrep -x "$APP_NAME" >/dev/null && pkill -x "$APP_NAME" || true

DEST="$APPLICATIONS_DIR/$APP_NAME.app"
if [[ -d "$DEST" ]]; then
  log "Régi verzió eltávolítása: $DEST"
  if ! rm -rf "$DEST" 2>/dev/null; then
    warn "Jogosultság szükséges a $APPLICATIONS_DIR írásához — sudo jön."
    sudo rm -rf "$DEST"
    log "Új verzió másolása (sudo)…"
    sudo cp -R "$APP_PATH" "$APPLICATIONS_DIR/"
    sudo xattr -cr "$DEST"
  else
    log "Új verzió másolása…"
    cp -R "$APP_PATH" "$APPLICATIONS_DIR/"
    xattr -cr "$DEST" 2>/dev/null || sudo xattr -cr "$DEST"
  fi
else
  log "Új verzió másolása…"
  if ! cp -R "$APP_PATH" "$APPLICATIONS_DIR/" 2>/dev/null; then
    sudo cp -R "$APP_PATH" "$APPLICATIONS_DIR/"
  fi
  xattr -cr "$DEST" 2>/dev/null || sudo xattr -cr "$DEST"
fi
ok "Telepítve: $DEST"

# ---- 5) Indítás ------------------------------------------------------------
log "Indítás…"
open "$DEST"

echo
ok "Frissítés kész — fut a legfrissebb $APP_NAME. 🎉"
echo "   Verzió: $(cd "$WORKDIR" && git rev-parse --short HEAD) ($BRANCH)"
echo "   Adataid (fiókok, piszkozatok, aláírások) megmaradtak."

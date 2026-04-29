#!/usr/bin/env bash
# =============================================================================
#  MepodMail / cozy-email-pad — helyi frissítő script
# -----------------------------------------------------------------------------
#  Ez a script a GitHub repó (https://github.com/andrasmester-art/cozy-email-pad)
#  legfrissebb állapotát húzza le, telepíti a függőségeket, buildeli a frontendet,
#  majd újracsomagolja az Electron alkalmazást.
#
#  Használat:
#    chmod +x scripts/update-app.sh
#    ./scripts/update-app.sh                # default: linux x64
#    PLATFORM=win32   ./scripts/update-app.sh
#    PLATFORM=darwin  ARCH=arm64 ./scripts/update-app.sh
#    SKIP_PULL=1      ./scripts/update-app.sh   # csak újrabuild, git pull nélkül
#    SKIP_PACKAGE=1   ./scripts/update-app.sh   # csak vite build
# =============================================================================

set -euo pipefail

# ---- Konfiguráció ----------------------------------------------------------
REPO_URL="https://github.com/andrasmester-art/cozy-email-pad.git"
APP_NAME="${APP_NAME:-MepodMail}"
PLATFORM="${PLATFORM:-linux}"   # linux | darwin | win32
ARCH="${ARCH:-x64}"             # x64 | arm64
BRANCH="${BRANCH:-main}"
OUT_DIR="electron-release"

# ---- Színes log helper -----------------------------------------------------
log()  { printf "\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "\033[1;32m✓ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m! %s\033[0m\n" "$*"; }
err()  { printf "\033[1;31m✗ %s\033[0m\n" "$*" >&2; }

# ---- Előfeltételek ---------------------------------------------------------
command -v node >/dev/null || { err "Node.js nincs telepítve"; exit 1; }
command -v npm  >/dev/null || { err "npm nincs telepítve";    exit 1; }
command -v git  >/dev/null || { err "git nincs telepítve";    exit 1; }

# A script a projekt gyökeréből fut — mindegy honnan hívják
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

log "Projekt mappa: $PROJECT_DIR"
log "Cél platform:  $PLATFORM-$ARCH"

# ---- 1) Legfrissebb kód lehúzása -------------------------------------------
if [[ "${SKIP_PULL:-0}" != "1" ]]; then
  if [[ -d .git ]]; then
    log "Git pull ($BRANCH)…"
    git fetch origin "$BRANCH"
    # Csak a követett fájlokat frissítjük; helyi módosítások megmaradnak stash-ben
    if ! git diff --quiet || ! git diff --cached --quiet; then
      warn "Helyi módosítások találhatók — stash-elem őket."
      git stash push -u -m "update-app.sh autostash $(date +%s)"
    fi
    git reset --hard "origin/$BRANCH"
    ok "Repo frissítve: $(git rev-parse --short HEAD)"
  else
    warn "Nincs .git mappa — ideiglenes klónozás és bemásolás."
    TMP="$(mktemp -d)"
    git clone --depth=1 --branch "$BRANCH" "$REPO_URL" "$TMP/repo"
    rsync -a --delete \
      --exclude='node_modules' --exclude='dist' --exclude="$OUT_DIR" \
      --exclude='.env' --exclude='.env.local' \
      "$TMP/repo/" "$PROJECT_DIR/"
    rm -rf "$TMP"
    ok "Forrás bemásolva."
  fi
else
  warn "SKIP_PULL=1 — git lépés kihagyva."
fi

# ---- 2) Függőségek ---------------------------------------------------------
log "npm install…"
npm install --no-audit --no-fund

# Electron csomagolóhoz szükséges devDeps (idempotens)
if ! npm ls electron >/dev/null 2>&1 || ! npm ls @electron/packager >/dev/null 2>&1; then
  log "Electron + @electron/packager telepítése…"
  npm install --save-dev electron @electron/packager --no-audit --no-fund
fi
ok "Függőségek készen."

# ---- 3) Frontend build -----------------------------------------------------
log "Vite build…"
npx vite build
ok "dist/ elkészült."

if [[ "${SKIP_PACKAGE:-0}" == "1" ]]; then
  ok "SKIP_PACKAGE=1 — csomagolás kihagyva. Kész."
  exit 0
fi

# ---- 4) Electron csomag ----------------------------------------------------
log "Electron csomagolás ($PLATFORM-$ARCH)…"
rm -rf "$OUT_DIR/$APP_NAME-$PLATFORM-$ARCH"
npx @electron/packager . "$APP_NAME" \
  --platform="$PLATFORM" \
  --arch="$ARCH" \
  --out="$OUT_DIR" \
  --overwrite \
  --ignore='^/src' \
  --ignore='^/public' \
  --ignore='^/scripts' \
  --ignore="^/$OUT_DIR"

PKG_PATH="$OUT_DIR/$APP_NAME-$PLATFORM-$ARCH"
ok "Csomag elkészült: $PKG_PATH"

# ---- 5) Tippek -------------------------------------------------------------
case "$PLATFORM" in
  linux)
    echo
    ok "Indítás:  ./$PKG_PATH/$APP_NAME"
    ;;
  darwin)
    echo
    ok "Indítás:  open ./$PKG_PATH/$APP_NAME.app"
    ;;
  win32)
    echo
    ok "Indítás:  ./$PKG_PATH/$APP_NAME.exe"
    ;;
esac

echo
ok "Frissítés sikeresen befejezve. 🎉"

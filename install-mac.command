#!/bin/bash
# Mailwise — Egykattintásos Mac telepítő
# Dupla klikkel futtatható (.command fájl). Mindent magától elintéz:
#  1. Ellenőrzi a Node.js-t, ha nincs, telepíti (Homebrew-val)
#  2. npm install
#  3. Mac app build
#  4. Megnyitja a kész .app fájlt

set -e

# Színek
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# A script mappájába lépés (a projekt gyökere)
cd "$(dirname "$0")"

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Mailwise — Mac telepítő                 ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "Projekt mappa: ${YELLOW}$(pwd)${NC}"
echo ""

# ─── 1. Node.js ellenőrzés ────────────────────────────────────────
echo -e "${BLUE}[1/4]${NC} Node.js ellenőrzése…"

if ! command -v node >/dev/null 2>&1; then
  echo -e "${YELLOW}⚠  Node.js nincs telepítve.${NC}"

  # Homebrew telepítés/ellenőrzés
  if ! command -v brew >/dev/null 2>&1; then
    echo -e "${YELLOW}→ Homebrew telepítése (kb. 2-5 perc)…${NC}"
    echo -e "${YELLOW}  A rendszer kérheti a Mac jelszavadat.${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Apple Silicon Mac-en a brew elérhetővé tétele a session-ben
    if [ -x /opt/homebrew/bin/brew ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x /usr/local/bin/brew ]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  fi

  echo -e "${YELLOW}→ Node.js telepítése (kb. 1-2 perc)…${NC}"
  brew install node
else
  NODE_VERSION=$(node --version)
  echo -e "${GREEN}✓ Node.js telepítve: $NODE_VERSION${NC}"
fi

# ─── 2. Függőségek ────────────────────────────────────────────────
echo ""
echo -e "${BLUE}[2/4]${NC} Függőségek telepítése (npm install)…"
echo -e "${YELLOW}    Ez 1-3 percig tarthat, légy türelmes…${NC}"
npm install
echo -e "${GREEN}✓ Függőségek telepítve${NC}"

# Electron + packager + IMAP/SMTP runtime függőségek
echo -e "${YELLOW}→ Electron és levelező csomagok ellenőrzése…${NC}"
npm install --save-dev electron @electron/packager
npm install --save imap mailparser nodemailer

# ─── 3. Build ─────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}[3/4]${NC} Mac app build (kb. 30-60 mp)…"

# package.json "main" mező biztosítása (Electron entry point)
if ! grep -q '"main"' package.json; then
  echo -e "${YELLOW}→ package.json kiegészítése (main: electron/main.cjs)…${NC}"
  node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.main='electron/main.cjs';fs.writeFileSync('package.json',JSON.stringify(p,null,2));"
fi

# Vite build
npx vite build

# Architektúra detektálás
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  PACKAGER_ARCH="arm64"
  echo -e "${YELLOW}→ Apple Silicon detektálva${NC}"
else
  PACKAGER_ARCH="x64"
  echo -e "${YELLOW}→ Intel Mac detektálva${NC}"
fi

# Electron csomagolás
npx @electron/packager . "Mailwise" \
  --platform=darwin \
  --arch=$PACKAGER_ARCH \
  --out=dist-mac \
  --overwrite \
  --ignore="^/src" \
  --ignore="^/public" \
  --ignore="^/dist-mac" \
  --ignore="install-mac.command"

echo -e "${GREEN}✓ Build kész${NC}"

# ─── 4. Megnyitás ─────────────────────────────────────────────────
echo ""
echo -e "${BLUE}[4/4]${NC} Mailwise.app indítása…"

APP_PATH="dist-mac/Mailwise-darwin-$PACKAGER_ARCH/Mailwise.app"

if [ -d "$APP_PATH" ]; then
  # macOS quarantine attribútum eltávolítása (hogy ne kelljen jobb klikk → Megnyitás)
  xattr -cr "$APP_PATH" 2>/dev/null || true

  # Másolás az Alkalmazások mappába (opcionális, kérdezzük meg)
  echo ""
  echo -e "${GREEN}╔═══════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║   ✓ Készen van!                           ║${NC}"
  echo -e "${GREEN}╚═══════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "Az app helye: ${YELLOW}$(pwd)/$APP_PATH${NC}"
  echo ""
  read -p "Másoljam az Alkalmazások mappába? (i/n): " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[IiYy]$ ]]; then
    cp -R "$APP_PATH" /Applications/
    echo -e "${GREEN}✓ Telepítve: /Applications/Mailwise.app${NC}"
    open "/Applications/Mailwise.app"
  else
    open "$APP_PATH"
  fi

  echo ""
  echo -e "${GREEN}A Mailwise most elindul. Jó használatot!${NC}"
else
  echo -e "${RED}✗ Hiba: $APP_PATH nem található${NC}"
  exit 1
fi

echo ""
read -p "Nyomj Entert a bezáráshoz…"

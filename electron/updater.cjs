// In-app updater for the Electron build of MEpodMail.
//
// Two strategies depending on how the app is installed:
//
//   A) Unpacked / dev install (app.getAppPath() is writable, not inside .asar)
//      → git pull / tarball download into the app folder, npm install + build,
//        then reload the renderer in-place.
//
//   B) Packaged .app bundle (the typical case — code lives inside .asar and
//      is read-only)
//      → Download the source tarball into a temp folder, run npm install +
//        npm run build, repackage with @electron/packager, then write a
//        small shell script that:
//           1. waits for the current app to quit,
//           2. replaces the .app bundle in /Applications (or wherever the
//              current bundle lives),
//           3. clears the Gatekeeper quarantine attribute,
//           4. relaunches the new app.
//        The current app then quits, the script takes over, and the user
//        sees the new version pop up automatically.

const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const os = require("os");

const REPO_URL = "https://github.com/andrasmester-art/cozy-email-pad.git";
const REPO_OWNER = "andrasmester-art";
const REPO_NAME = "cozy-email-pad";
const DEFAULT_BRANCH = "main";
const APP_NAME = "MEpodMail";

function appRoot() {
  return app.getAppPath();
}

// Path to the .app bundle currently running (e.g. /Applications/MEpodMail.app).
// On macOS this is two levels above app.getAppPath() (which is .../Contents/Resources/app or app.asar).
function currentAppBundle() {
  if (process.platform !== "darwin") return null;
  // app.getPath('exe') = /Applications/MEpodMail.app/Contents/MacOS/MEpodMail
  const exe = app.getPath("exe");
  const idx = exe.indexOf(".app/");
  if (idx === -1) return null;
  return exe.slice(0, idx + 4); // include ".app"
}

function isGitRepo(dir) {
  return fs.existsSync(path.join(dir, ".git"));
}

function isWritable(dir) {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return !dir.includes(".asar");
  } catch {
    return false;
  }
}

function isPackagedBundle() {
  return appRoot().includes(".asar") || appRoot().includes(".app/Contents");
}

function run(cmd, args, opts, onLog) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, shell: false });
    let stderr = "";
    child.stdout?.on("data", (d) => onLog?.(d.toString()));
    child.stderr?.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      onLog?.(s);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}\n${stderr.slice(0, 500)}`));
    });
  });
}

function fetchLatestSha() {
  return new Promise((resolve, reject) => {
    const opts = {
      host: "api.github.com",
      path: `/repos/${REPO_OWNER}/${REPO_NAME}/commits/${DEFAULT_BRANCH}`,
      headers: { "User-Agent": "MEpodMail-Updater", Accept: "application/vnd.github+json" },
    };
    https.get(opts, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`GitHub API ${res.statusCode}: ${body.slice(0, 200)}`));
        }
        try {
          const j = JSON.parse(body);
          resolve({
            sha: j.sha,
            message: j.commit?.message || "",
            date: j.commit?.author?.date || "",
          });
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

function readLocalSha(dir) {
  try {
    const head = fs.readFileSync(path.join(dir, ".git", "HEAD"), "utf-8").trim();
    if (head.startsWith("ref:")) {
      const ref = head.slice(4).trim();
      return fs.readFileSync(path.join(dir, ".git", ref), "utf-8").trim();
    }
    return head;
  } catch {
    return null;
  }
}

ipcMain.handle("updater:info", async () => {
  const root = appRoot();
  const writable = isWritable(root);
  const git = isGitRepo(root);
  const packaged = isPackagedBundle();
  let local = null;
  if (git) local = readLocalSha(root);
  let remote = null;
  let remoteError = null;
  try {
    remote = await fetchLatestSha();
  } catch (e) {
    remoteError = String(e?.message || e);
  }
  return {
    appRoot: root,
    writable: writable || packaged, // packaged builds also support self-update via bundle replacement
    isGit: git,
    localSha: local,
    remoteSha: remote?.sha || null,
    remoteMessage: remote?.message || null,
    remoteDate: remote?.date || null,
    remoteError,
    repoUrl: REPO_URL,
    branch: DEFAULT_BRANCH,
    upToDate: !!(local && remote?.sha && local === remote.sha),
  };
});

ipcMain.handle("updater:apply", async (event) => {
  const sender = event.sender;
  const log = (line) => {
    try { sender.send("updater:log", line); } catch {}
  };

  const root = appRoot();
  log(`▶︎ Frissítés indítása…\n   App: ${root}\n`);

  // === Strategy A: in-place update (writable folder) ===
  if (isWritable(root) && !isPackagedBundle()) {
    return await inPlaceUpdate(root, log);
  }

  // === Strategy B: packaged .app bundle update on macOS ===
  if (process.platform === "darwin" && isPackagedBundle()) {
    return await bundleUpdate(log);
  }

  throw new Error(
    "Ez a telepítés nem támogatja az automatikus frissítést. " +
    "Töltsd le a legfrissebb ZIP-et és futtasd az update.command fájlt."
  );
});

async function inPlaceUpdate(root, log) {
  if (isGitRepo(root)) {
    log("→ git fetch origin\n");
    await run("git", ["fetch", "origin"], { cwd: root }, log);
    log(`→ git reset --hard origin/${DEFAULT_BRANCH}\n`);
    await run("git", ["reset", "--hard", `origin/${DEFAULT_BRANCH}`], { cwd: root }, log);
  } else {
    log("→ Tarball letöltése…\n");
    const tarUrl = `https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/refs/heads/${DEFAULT_BRANCH}`;
    const tmpTar = path.join(os.tmpdir(), `mepodmail-${Date.now()}.tar.gz`);
    await downloadFile(tarUrl, tmpTar, log);
    log("→ Kicsomagolás\n");
    await run(
      "tar",
      ["-xzf", tmpTar, "-C", root, "--strip-components=1",
        "--exclude=node_modules", "--exclude=.git"],
      { cwd: root },
      log,
    );
    fs.unlinkSync(tmpTar);
  }

  log("→ npm install\n");
  await run("npm", ["install", "--no-audit", "--no-fund"], { cwd: root }, log);
  log("→ npm run build\n");
  await run("npm", ["run", "build"], { cwd: root }, log);

  log("✓ Frissítés kész. Ablak újratöltése…\n");
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.reloadIgnoringCache();
  }
  return { ok: true };
}

async function bundleUpdate(log) {
  const bundle = currentAppBundle();
  if (!bundle) throw new Error("Nem találom a futó .app bundle helyét.");

  log(`   Bundle: ${bundle}\n`);

  // Prerequisites: npm + node + a writable PATH. We use /usr/bin & /usr/local/bin
  // and Homebrew paths so common installations work even when launched from Finder.
  const env = {
    ...process.env,
    PATH: [
      process.env.PATH || "",
      "/usr/local/bin",
      "/opt/homebrew/bin",
      "/usr/bin",
      "/bin",
    ].filter(Boolean).join(":"),
  };

  // Verify npm exists.
  try {
    await run("which", ["npm"], { env }, log);
  } catch {
    throw new Error(
      "Nincs telepítve Node.js / npm a gépeden. " +
      "Telepítsd a Node.js-t (https://nodejs.org), majd próbáld újra. " +
      "Vagy futtasd kézzel az update.command fájlt a letöltött ZIP-ből."
    );
  }

  const work = path.join(os.tmpdir(), `mepodmail-update-${Date.now()}`);
  fs.mkdirSync(work, { recursive: true });
  log(`→ Munkamappa: ${work}\n`);

  // 1. Download tarball
  log("→ Forráskód letöltése a GitHub-ról…\n");
  const tarUrl = `https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/refs/heads/${DEFAULT_BRANCH}`;
  const tmpTar = path.join(work, "src.tar.gz");
  await downloadFile(tarUrl, tmpTar, log);

  const srcDir = path.join(work, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  log("→ Kicsomagolás\n");
  await run("tar", ["-xzf", tmpTar, "-C", srcDir, "--strip-components=1"], { env }, log);

  // 2. Install + build renderer
  log("→ npm install (ez 1-2 percig tarthat)…\n");
  await run("npm", ["install", "--no-audit", "--no-fund"], { cwd: srcDir, env }, log);

  log("→ npm run build (renderer)\n");
  await run("npm", ["run", "build"], { cwd: srcDir, env }, log);

  // 3. Repackage .app
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  log(`→ Electron csomagolás (${arch})…\n`);
  const outDir = path.join(work, "release");
  await run(
    "npx",
    [
      "--yes", "@electron/packager",
      ".",
      APP_NAME,
      "--platform=darwin",
      `--arch=${arch}`,
      `--out=${outDir}`,
      "--overwrite",
    ],
    { cwd: srcDir, env },
    log,
  );

  const newBundle = path.join(outDir, `${APP_NAME}-darwin-${arch}`, `${APP_NAME}.app`);
  if (!fs.existsSync(newBundle)) {
    throw new Error(`Az új bundle nem jött létre: ${newBundle}`);
  }
  log(`✓ Új bundle elkészült: ${newBundle}\n`);

  // 4. Write a swap-and-relaunch script
  const swapScript = path.join(work, "swap.sh");
  const logFile = path.join(work, "swap.log");
  const pid = process.pid;
  const sh = `#!/bin/bash
set -e
exec >> "${logFile}" 2>&1
echo "[swap] starting at $(date)"
echo "[swap] waiting for pid ${pid} to exit…"
for i in $(seq 1 60); do
  if ! kill -0 ${pid} 2>/dev/null; then break; fi
  sleep 0.5
done
echo "[swap] replacing bundle"
rm -rf "${bundle}"
cp -R "${newBundle}" "${bundle}"
xattr -cr "${bundle}" || true
echo "[swap] launching new app"
open "${bundle}"
echo "[swap] done"
`;
  fs.writeFileSync(swapScript, sh, { mode: 0o755 });

  log("→ Csere indítása, app újraindul…\n");

  // Detach the script so it survives our quit.
  const child = spawn("/bin/bash", [swapScript], {
    detached: true,
    stdio: "ignore",
    env,
  });
  child.unref();

  // Give the script a moment to start, then quit.
  setTimeout(() => app.quit(), 800);

  return { ok: true };
}

function downloadFile(url, dest, log, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
        return resolve(downloadFile(res.headers.location, dest, log, redirects + 1));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Letöltés hiba ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      let received = 0;
      res.on("data", (c) => {
        received += c.length;
        if (received % (512 * 1024) < c.length) {
          log?.(`   ${(received / 1024 / 1024).toFixed(1)} MB letöltve\n`);
        }
      });
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
      file.on("error", reject);
    }).on("error", reject);
  });
}

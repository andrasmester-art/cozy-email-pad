// In-app updater for the Electron build of MEpodMail.
// Pulls the latest source from the configured GitHub repository, rebuilds
// the renderer (`npm run build`), then asks the main window to reload.
//
// Strategy:
//   1. If the app directory is a git working copy → `git fetch && git reset --hard origin/<branch>`
//   2. Otherwise → download the branch tarball from GitHub and overwrite files
//      under the app root, preserving `node_modules` and user data.
//   3. Run `npm install --production=false` and `npm run build`.
//   4. Notify the renderer; it then reloads `dist/index.html`.

const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const os = require("os");

const REPO_URL = "https://github.com/andrasmester-art/cozy-email-pad.git";
const REPO_OWNER = "andrasmester-art";
const REPO_NAME = "cozy-email-pad";
const DEFAULT_BRANCH = "main";

// In a packaged Electron app `app.getAppPath()` points at the resources/app
// folder which is read-only inside an .asar. We only support self-update from
// an unpacked install (the .command/.tar.gz/.zip distributions used here).
function appRoot() {
  return app.getAppPath();
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
      else reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}\n${stderr}`));
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
    writable,
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
  const root = appRoot();
  if (!isWritable(root)) {
    throw new Error(
      "Az app telepítési könyvtára nem írható (valószínűleg .asar csomag). " +
      "Használj fejlesztői vagy kicsomagolt buildet az automatikus frissítéshez."
    );
  }

  const sender = event.sender;
  const log = (line) => {
    try { sender.send("updater:log", line); } catch {}
  };

  log(`▶︎ Frissítés indítása…\n   App: ${root}\n`);

  // 1. Sync source.
  if (isGitRepo(root)) {
    log("→ git fetch origin\n");
    await run("git", ["fetch", "origin"], { cwd: root }, log);
    log(`→ git reset --hard origin/${DEFAULT_BRANCH}\n`);
    await run("git", ["reset", "--hard", `origin/${DEFAULT_BRANCH}`], { cwd: root }, log);
  } else {
    log("→ A telepítés nem git repó, tarball letöltése a GitHub-ról…\n");
    const tarUrl = `https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/refs/heads/${DEFAULT_BRANCH}`;
    const tmpTar = path.join(os.tmpdir(), `mepodmail-${Date.now()}.tar.gz`);
    await downloadFile(tarUrl, tmpTar, log);
    log("→ Kicsomagolás (tar -xzf), node_modules megőrzése\n");
    await run(
      "tar",
      ["-xzf", tmpTar, "-C", root, "--strip-components=1",
        "--exclude=node_modules", "--exclude=.git"],
      { cwd: root },
      log,
    );
    fs.unlinkSync(tmpTar);
  }

  // 2. Install + build.
  log("→ npm install\n");
  await run("npm", ["install", "--no-audit", "--no-fund"], { cwd: root }, log);
  log("→ npm run build\n");
  await run("npm", ["run", "build"], { cwd: root }, log);

  log("✓ Frissítés kész. Ablak újratöltése…\n");

  // 3. Reload the renderer in-place.
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.reloadIgnoringCache();
  }
  return { ok: true };
});

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
        if (received % (256 * 1024) < c.length) {
          log?.(`   ${(received / 1024).toFixed(0)} KB letöltve\n`);
        }
      });
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
      file.on("error", reject);
    }).on("error", reject);
  });
}

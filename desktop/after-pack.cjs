// After electron-builder has laid the app out and before it is wrapped in a disk image.
//
// On a Mac every binary must carry a code signature or Gatekeeper reports the app as "damaged"
// on Apple silicon, and on macOS 26 V8 needs the hardened runtime's permission to write machine
// code or the process is stopped as it starts. There is no Apple Developer identity yet, so the
// app is ad-hoc signed here, under the hardened runtime, with the entitlements Electron needs.
// It then opens with the "unidentified developer" notice, which right-click → Open gets past; a
// notarised build (an Apple Developer account) is what removes that notice.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function danglingLinks(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) {
      if (!fs.existsSync(p)) out.push(p);
    } else if (st.isDirectory()) {
      danglingLinks(p, out);
    }
  }
  return out;
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  if (!fs.existsSync(app)) throw new Error(`[after-pack] no app bundle at ${app}: ${fs.readdirSync(context.appOutDir).join(", ")}`);
  const entitlements = path.join(__dirname, "entitlements.mac.plist");
  // A link to nothing anywhere in the bundle fails the seal; say which and drop it first.
  for (const link of danglingLinks(app)) {
    console.warn(`[after-pack] dropping a symlink to nothing: ${path.relative(app, link)}`);
    fs.unlinkSync(link);
  }
  console.log(`[after-pack] ad-hoc signing ${app} with ${entitlements}`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", "--options", "runtime", "--timestamp=none", "--entitlements", entitlements, app], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=4", app], { stdio: "inherit" });
  execFileSync("codesign", ["--display", "--entitlements", "-", app], { stdio: "inherit" });
};

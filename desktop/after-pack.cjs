// After electron-builder has laid the app out and before it is wrapped in a disk image.
//
// On a Mac every binary must carry a code signature or Gatekeeper reports the app as "damaged"
// on Apple silicon, and on macOS 26 V8 needs the hardened runtime's permission to write machine
// code or the process is stopped as it starts. There is no Apple Developer identity yet, so the
// app is ad-hoc signed here, under the hardened runtime, with the entitlements Electron needs.
// It then opens with the "unidentified developer" notice, which System Settings → Privacy &
// Security → Open Anyway gets past; a notarised build (an Apple Developer account) removes it.
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

const SHOWN_NAME = "Flöda";

/** The value of one string key in an Info.plist, read as text. */
function plistString(plist, key) {
  const m = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(fs.readFileSync(plist, "utf8"));
  return m ? m[1] : null;
}

// Electron finds its helper apps by the bundle's CFBundleName ("<name> Helper.app" beside the
// framework) and stops with "Unable to find helper app" when there is none, so the plain name
// stays what electron-builder set it to and the name people see is localised instead: Finder,
// the Dock and the menu bar read CFBundleName and CFBundleDisplayName from InfoPlist.strings
// first, while Electron reads the plist itself.
function showAs(app, name) {
  const plist = path.join(app, "Contents", "Info.plist");
  const bundleName = plistString(plist, "CFBundleName");
  const helper = path.join(app, "Contents", "Frameworks", `${bundleName} Helper.app`);
  if (!fs.existsSync(helper)) throw new Error(`[after-pack] CFBundleName is "${bundleName}" but there is no ${helper}; Electron would stop at launch`);
  const resources = path.join(app, "Contents", "Resources");
  const lprojs = fs.readdirSync(resources).filter((d) => d.endsWith(".lproj"));
  if (lprojs.length === 0) lprojs.push("en.lproj");
  const strings = `CFBundleName = "${name}";\nCFBundleDisplayName = "${name}";\n`;
  for (const dir of lprojs) {
    fs.mkdirSync(path.join(resources, dir), { recursive: true });
    fs.writeFileSync(path.join(resources, dir, "InfoPlist.strings"), strings);
  }
  console.log(`[after-pack] CFBundleName ${bundleName} (helper at ${path.relative(app, helper)}); shown as ${name} in ${lprojs.length} localisations`);
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  if (!fs.existsSync(app)) throw new Error(`[after-pack] no app bundle at ${app}: ${fs.readdirSync(context.appOutDir).join(", ")}`);
  const entitlements = path.join(__dirname, "entitlements.mac.plist");
  showAs(app, SHOWN_NAME);
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

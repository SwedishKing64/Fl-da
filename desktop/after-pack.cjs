// After electron-builder has laid the app out and before it is wrapped in a disk image.
//
// On a Mac every binary must carry a code signature, even an ad-hoc one, or Gatekeeper reports
// the app as "damaged" on Apple silicon. There is no Apple Developer identity yet, so the app is
// ad-hoc signed here. It then opens with the "unidentified developer" notice, which right-click →
// Open gets past; a notarised build (an Apple Developer account) is what removes that notice.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`[after-pack] ad-hoc signing ${app}`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
};

// electron-builder afterPack hook: ad-hoc sign the packed macOS .app.
//
// We don't have an Apple Developer identity, but an UNSIGNED app won't run on
// Apple Silicon (the kernel refuses it — "is damaged and can't be opened").
// An ad-hoc signature (codesign --sign -) is enough to let it run; users still
// clear quarantine once (xattr -cr) because it isn't notarized.
const { execFileSync } = require('child_process')
const { join } = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = `${context.packager.appInfo.productFilename}.app`
  const appPath = join(context.appOutDir, appName)
  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
    console.log(`[afterPack] ad-hoc signed ${appPath}`)
  } catch (e) {
    console.warn('[afterPack] ad-hoc signing failed:', e && e.message)
  }
}

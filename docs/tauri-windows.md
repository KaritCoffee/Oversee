# Oversee Windows Desktop App

Oversee uses a Tauri shell around the existing local dashboard. The desktop process starts the bundled `server.js` service on `127.0.0.1:4173` and opens that address in the native Windows WebView.

## Prerequisites

- Node.js 20 or newer
- Rust and Cargo
- Microsoft C++ Build Tools
- Microsoft Edge WebView2 Runtime, normally included with Windows 10 and Windows 11

See the official [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for current Rust and Windows build-tool requirements.

## Development

```powershell
npm install
npm run desktop:dev
```

## Local Installer Build

```powershell
npm run check
npm run desktop:build
```

The helper script checks the required tools before building:

```powershell
.\scripts\build-windows.ps1
```

Tauri writes local installer output under:

```text
src-tauri\target\release\bundle\nsis
```

A local filename is determined by Tauri. The GitHub Actions workflow copies the final installer to a canonical release name such as:

```text
Oversee_3.5.0_windows-x64-unsigned-setup.exe
```

## CI Installer Rules

`.github/workflows/desktop-installers.yml` applies the following release gates:

- A release tag must be exactly `vX.Y.Z` and match `package.json`.
- `npm run check` must pass, including synchronized JavaScript, Tauri, Cargo, lockfile, and server version metadata.
- The Windows runner must report `x64` before the output can be labeled `windows-x64`.
- The installer receives a versioned name, a SHA-256 checksum file, and an explicit unsigned-build notice.
- Tagged builds are published as prereleases because no Authenticode signing credentials are configured.
- A separate release job recalculates the installer hash before attaching it to GitHub.

A manual workflow run creates downloadable CI artifacts but does not create a GitHub release.

## Installing Over An Existing Version

The NSIS language file presents an existing installation as an update or repair. Recipients normally do not need to uninstall Oversee first. Windows should replace the installed application when the new package has a higher synchronized version.

Before sharing an update:

1. Confirm the new version is greater than the installed version.
2. Run `npm run check` and build from the intended commit.
3. Verify the installer checksum.
4. Test install-over behavior on a non-development Windows account.
5. Confirm settings and local user data survive the update as intended.

Do not reuse an older version number for a different build. Windows and recipients need a monotonically increasing version to distinguish upgrades reliably.

## Verify The Unsigned Installer

Download the installer and its platform checksum file into one directory, then run:

```powershell
$installer = ".\Oversee_3.5.0_windows-x64-unsigned-setup.exe"
$checksum = ".\Oversee_3.5.0_windows-x64_unsigned_SHA256SUMS.txt"
$expected = ((Get-Content -LiteralPath $checksum -TotalCount 1) -split '\s+')[0].ToLowerInvariant()
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw "SHA-256 mismatch" }
"SHA-256 verified: $actual"
```

The matching hash confirms transfer integrity only. The current installer is not Authenticode signed, so SmartScreen may still warn. See [release-signing.md](./release-signing.md) before distributing any build.

## Runtime Packaging

The Windows build copies the local `node.exe` into Tauri resources before packaging. A recipient does not need to install Node.js separately. This preserves the existing public-feed adapters with lower migration risk, at the cost of a larger installer and a short local-service startup period.

Longer term, the local API service could move into Rust commands, but that is independent of release signing and should not be mixed into a packaging-only release.

## Update Check Integration Boundary

`server-src/release-update.js` provides strict SemVer comparison and converts a GitHub latest-release JSON object into a bounded, user-safe status. It deliberately omits release body, release name, API error text, arbitrary asset URLs, and arbitrary response URLs.

The module is not currently wired into `server.js`, the Tauri shell, or the UI. A future advisory check should:

1. Fetch only the expected repository's GitHub release endpoint with a timeout and modest cache interval.
2. Pass parsed JSON and the synchronized local version to `parseGitHubLatestReleaseResponse`.
3. Render only the returned fixed message, normalized versions, timestamp, and trusted release URL.
4. Treat network, rate-limit, and malformed-data failures as unavailable rather than as an update.
5. Never download or execute an asset merely because the advisory parser reports a newer version.

Automatic installation requires the separately configured and cryptographically signed Tauri updater described in [release-signing.md](./release-signing.md). No automatic updater is enabled today.

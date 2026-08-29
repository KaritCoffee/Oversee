# Oversee Windows Desktop App

Oversee now has a Tauri shell that opens the existing dashboard in a native Windows WebView.

## Prerequisites

- Node.js 20 or newer
- Rust and Cargo
- Microsoft C++ Build Tools
- Microsoft Edge WebView2 Runtime, normally already installed on Windows 10/11

Tauri's official setup guide is the best source for the Rust and Windows build-tool steps:

https://v2.tauri.app/start/prerequisites/

## Development

```powershell
npm install
npm run desktop:dev
```

The desktop app starts `server.js` on `127.0.0.1:4173` and opens that local address inside the Tauri window.

## Build A Windows Installer

```powershell
npm run desktop:build
```

Or use the helper script, which checks for the required tools first:

```powershell
.\scripts\build-windows.ps1
```

The installer output will be under:

```text
src-tauri\target\release\bundle
```

## Current Packaging Note

The Windows build copies the local `node.exe` into Tauri resources before packaging, so the installer can run the existing public-feed server without requiring Node.js on the recipient's machine.

Longer term, the local API server could be converted into Rust commands to reduce installer size, but bundling Node keeps the current data adapters intact with much lower risk.

The NSIS language file labels an existing installation as an update/repair rather than requiring a manual uninstall. Version metadata is checked by `npm run check:version` before release builds so an older package number cannot accidentally replace a newer build.

See [release-signing.md](./release-signing.md) before distributing installers. Test builds are unsigned unless signing credentials are explicitly configured.

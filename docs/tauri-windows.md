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

This first Windows shell expects a `node` runtime to be available when the desktop app starts. That keeps the existing public-feed server intact and low-risk.

For a fully self-contained installer later, bundle `node.exe` as a Tauri resource or convert the small local API server into Rust commands.

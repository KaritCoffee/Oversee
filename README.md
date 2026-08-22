# Oversee

Free-source public intelligence command center prototype.

## What It Does

Oversee is a browser-based operations console inspired by WorldView-style geospatial tools. It now defaults to a global scope and fuses free public data sources:

- Global/US camera inventory with official no-key adapters for NYC DOT, Caltrans, Transport for London JamCams, Iowa DOT, Ireland TII, Toronto, Florida 511, Georgia DOT, KYTC/Indiana TrafficWise, PennDOT source locations, Spain DGT, Madrid, Hong Kong, and more
- 3D globe with selectable cameras, satellites, flights, earthquakes, and alerts
- CelesTrak satellite GP data with approximate live orbital positioning and path arcs
- OpenSky public aircraft states with heading trails when anonymous rate limits allow access
- USGS all-day earthquake GeoJSON feed without magnitude filtering
- NASA FIRMS VIIRS near-real-time fire hotspot layer when a local FIRMS map key is configured
- National Weather Service active alerts for US scopes
- NOAA/NWS radar base reflectivity overlay for weather context on the Cesium globe
- Alert cards that show affected areas and center the 3D globe on the selected alert
- Leaflet/CARTO global camera map with a quiet no-label basemap for dense camera browsing
- Sensor modes for CRT, night vision, FLIR-style, and clean viewing

## Free Now, Paid Later

The current build intentionally uses free public sources. Good paid upgrades later would be photorealistic 3D tiles, commercial ADS-B, AIS maritime data, archived replay storage, and commercial satellite imagery.

## Run Locally

From the repo root:

```powershell
node .\server.js
```

Open the URL printed in the terminal, usually:

[http://localhost:4173](http://localhost:4173)

If `4173` is busy, the server automatically tries `4183`, `4193`, `4203`, then `4303`.

Optional:

- Set `PORT` before starting if you want a specific port.
- Set `OPENSKY_TOKEN` if you have an OpenSky bearer token.
- Set `NASA_FIRMS_MAP_KEY`, `FIRMS_MAP_KEY`, or create an ignored `config.local.json` with `nasaFirmsMapKey` to enable NASA FIRMS fire hotspots. Desktop builds can also include a bundled default key and still let users override it locally in Settings.
- Double-click [run-oversee.bat](./run-oversee.bat) to launch from Explorer.

## Windows Desktop App

The repo now includes a Tauri shell for a native Windows WebView app.

Install JavaScript dependencies:

```powershell
npm install
```

Run the desktop app during development:

```powershell
npm run desktop:dev
```

Build a Windows installer:

```powershell
npm run desktop:build
```

Or use the helper script, which checks prerequisites first:

```powershell
.\scripts\build-windows.ps1
```

Desktop builds require Rust/Cargo and Microsoft C++ Build Tools. See [docs/tauri-windows.md](./docs/tauri-windows.md) for setup notes.

## Mac Desktop App

macOS installers must be built on macOS. The repo includes a GitHub Actions workflow that can build a `.dmg` on a macOS runner:

```powershell
gh workflow run desktop-installers.yml
```

If you build locally on a Mac:

```bash
npm install
npm run desktop:build -- --bundles dmg
```

## Notes

Satellite positions are generated from public CelesTrak element data with a lightweight browser-friendly approximation. They are good for visualization and situational context, not precision orbital analysis.

The globe intentionally samples very large layers so the UI stays responsive. Use the camera browser and map for full camera inventory browsing; use the globe for situational context and quick selection.

Some public cameras expose true live players or HLS playlists, while many transportation cameras expose refreshed still images. The UI labels those differently, validates HLS streams before playing them, and auto-refreshes still images so the dashboard does not pretend a still image is video.

The main public-signal snapshot refreshes every 60 seconds. Flight positions, alerts, and earthquake counts update when the upstream public APIs respond; camera stills refresh at each source's published or inferred interval.

Oversee keeps a local runtime cache for public API results under the user's local app data folder. If an upstream source is temporarily down after a successful previous fetch, the dashboard can keep showing a clearly labeled stale cache instead of dropping the layer entirely.

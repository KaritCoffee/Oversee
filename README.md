# Oversee

Free-source global situational-awareness desktop app.

## What It Does

Oversee is a local-first operations console that fuses public geospatial data without pretending that best-effort sources are authoritative or always online. Version 3.3 expands the official no-key camera inventory and adds spatial deduplication, coverage balancing, scored media health, and automatic fallback selection.

- Global camera inventory with official public adapters across the US, Canada, Europe, Asia, Australia, New Zealand, and Puerto Rico
- No-key camera catalogs from Taiwan, BayernInfo, Vancouver, 511SC, 511NY, Idaho 511, New England 511, Atlantic Canada 511, Estonia, Iceland, and other public agencies
- Cesium and lightweight operations globes with selectable cameras, satellites, flights, earthquakes, fires, alerts, population, vessels, missions, and radio
- CelesTrak orbital elements with automatic SatNOGS fallback, propagated in the browser with SGP4
- OpenSky public aircraft states with heading trails when anonymous rate limits allow access
- USGS all-day earthquake GeoJSON feed without magnitude filtering
- NASA FIRMS VIIRS near-real-time fire hotspot layer when a local FIRMS map key is configured
- EGP WildFireSA incidents, WFIGS perimeters, NWS alerts, and NHC tropical systems
- NOAA radar and FEMA flood overlays for weather and hazard context
- City-scale road traffic on both maps: an explicitly modeled OpenStreetMap motion layer by default, with optional TomTom real-time congestion colors
- Live TomTom incidents and closures in local map views and Area Briefs when a user key is configured
- Area Briefs with 25/100/250 km summaries, nearby hazards/cameras/assets, local weather, aviation weather, and optional OpenAQ monitor readings
- Persistent watched areas with change detection, subtle notifications, and a bounded local history playback trail
- Global Open-Meteo conditions, GDACS disasters, Aviation Weather Center observations/advisories, and NOAA space-weather context
- Census Population Estimates for state-level population context
- Optional no-key launch missions from Launch Library 2 and public stations from Radio Browser
- Optional live AIS vessel positions when the user supplies an AISStream key
- Alert cards that show affected areas and center the 3D globe on the selected alert
- Leaflet camera browser with viewport-scoped results, live/still filters, map marker control, and an adjacent watch pane
- Source-aware health, validated alternate camera media, stale-cache fallbacks, pinned assets, live motion trails, demo mode, and adaptive level-of-detail rendering

## Free Now, Paid Later

The default experience intentionally uses free public sources. User-supplied keys can unlock NASA FIRMS, TomTom live traffic, OpenAQ monitor readings, AISStream, and keyed transportation catalogs without putting credentials in the repository. Future integrations are not shown as active settings until they actually power a feature.

## Run Locally

From the repo root:

```powershell
npm install
npm start
```

Open the URL printed in the terminal, usually:

[http://localhost:4173](http://localhost:4173)

If `4173` is busy, the server automatically tries `4183`, `4193`, `4203`, then `4303`.

Optional:

- Set `PORT` before starting if you want a specific port.
- Enter optional credentials in Settings or provide supported environment variables. Local settings are stored outside Git.
- Set `NASA_FIRMS_MAP_KEY`, `FIRMS_MAP_KEY`, or create an ignored `config.local.json` with `nasaFirmsMapKey` to enable NASA FIRMS fire hotspots.
- Set `TOMTOM_TRAFFIC_API_KEY`, `TOMTOM_API_KEY`, or save `tomTomTrafficApiKey` in Settings to replace modeled road colors with TomTom traffic flow tiles. The local server hides the key, caches tiles, and enforces a 5,000-request daily ceiling.
- Double-click [run-oversee.bat](./run-oversee.bat) to launch from Explorer.

Development commands:

```powershell
npm run dev
npm test
npm run build
npm run check
```

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

Tagged workflow runs publish Windows and macOS installers plus SHA-256 checksum files to a GitHub release. Builds remain unsigned unless platform signing and Apple notarization credentials are configured; see [docs/release-signing.md](./docs/release-signing.md).

## Data Notes

Satellite positions and tracks are propagated from public two-line elements with `satellite.js`/SGP4. They are suitable for visualization and broad situational context, not navigation, conjunction analysis, or precision orbital work.

The globe intentionally samples very large layers so the UI stays responsive. Use the camera browser and map for full camera inventory browsing; use the globe for situational context and quick selection.

Some public cameras expose true live players or HLS playlists, while many transportation cameras expose refreshed still images. Oversee performs bounded content checks on direct video, HLS, and still-image endpoints, labels working fallbacks as degraded, and advances through alternate public media when a preferred endpoint fails. Stills auto-refresh without being presented as live video.

The no-key road traffic layer is an illustrative time-of-day model over real OpenStreetMap road geometry, not a traffic observation. When a TomTom key is configured, road colors use TomTom Traffic Flow while the moving points remain illustrative. Both views are limited to city/metro zoom so global navigation does not waste public-service or keyed tile requests.

The main public-signal snapshot refreshes every 60 seconds. Rate-sensitive aircraft and orbital requests are cached for 10 minutes, alerts and earthquakes refresh more often, and camera stills use each source's published or inferred interval.

Oversee keeps a local runtime cache for public API results under the user's local app data folder. If an upstream source is temporarily down after a successful previous fetch, the dashboard can keep showing a clearly labeled stale cache instead of dropping the layer entirely.

All feeds remain subject to their originating agency's availability, terms, licensing, delay, and accuracy. Use the source links and official instructions before acting on important information.

See [docs/privacy-and-data.md](./docs/privacy-and-data.md) for local storage, API-key, and network-request details.

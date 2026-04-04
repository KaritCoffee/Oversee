# Oversee

Oregon-first public camera monitor prototype.

## What is in this repo

- A no-dependency dashboard prototype in [index.html](./index.html)
- Seeded Oregon source and feed catalog in [data.js](./assets/data.js)
- Pacific Northwest operations-room styling in [styles.css](./assets/styles.css)
- Product and research plan in [oregon-public-camera-dashboard-plan.md](./docs/oregon-public-camera-dashboard-plan.md)

## Current status

This is now a runnable local prototype with a lightweight built-in Node server.

It includes:

- Statewide Oregon source registry
- Seeded city and town camera coverage
- In-dashboard watch pane with best-effort embedded camera views
- Slippy Oregon camera map with clickable feed markers
- Operations Theater map with Oregon cameras plus public earthquake, alert, and best-effort flight layers
- Live adapter snapshots for TripCheck, OHAZ / ALERTWest, Salem, and Newport
- Filters for region, category, media type, and city/town-only mode
- Public data layer recommendations for weather, wildfire, traffic, transit, air quality, and hydrology

## Run locally

From the repo root, run:

```powershell
node .\server.js
```

Then open:

- the URL printed in the terminal, usually [http://localhost:4173](http://localhost:4173)

Optional:

- If `4173` is occupied, the server automatically falls back to `4183`, `4193`, `4203`, then `4303`.
- Set `PORT` before starting if you want a specific port.
- Set `OPENSKY_TOKEN` if you want the flight layer to use an authenticated OpenSky bearer token when available.
- You can also double-click [run-oversee.bat](./run-oversee.bat) to launch it from Explorer. It will keep a console window open and print the active URL.

## Recommended next build step

Extend the live adapter layer to:

1. ODOT TripCheck
2. OHAZ / ALERTWest
3. City of Salem traffic camera viewer
4. City of Newport webcam

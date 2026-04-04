# Oregon Public Camera Dashboard Plan

## Product Goal

Build an Oregon-first public monitoring dashboard that aggregates authorized public camera feeds and adjacent real-time public safety data into one fast, map-driven interface.

The product should let a user:

- Browse every Oregon camera source we have approved
- Filter by area, county, corridor, hazard, and source
- Switch between "everything" view and focused regional views
- Open true live streams when available
- Fall back gracefully to still-image cameras that refresh every few minutes
- See surrounding context like incidents, weather, smoke, closures, and wildfire activity

## Reality Check

"All public access camera feeds on the internet" is not a realistic or safe v1 scope.

What is realistic:

- Aggregate public, authorized, documented Oregon camera sources
- Normalize them into one searchable catalog
- Add a source review process for new feeds
- Expand over time to more Oregon publishers, then more states

What we should not do:

- Port-scan the internet for exposed cameras
- Ingest feeds with unclear ownership or unclear public-use terms
- Present private or semi-public cameras as if they are fair game

Recommended v1 scope:

- Oregon transportation, wildfire, and public-service cameras
- Oregon public safety, weather, and environmental situational data

## Oregon Source Inventory

### Tier 1: Must-have Oregon camera sources

1. ODOT TripCheck
- Best statewide base layer
- Official TripCheck API offers CCTV inventory plus still image URLs
- Also exposes incidents, local incidents, weather stations, road/weather reports, detectors, work zones, and Multnomah Falls parking
- Most cameras refresh about every 5 minutes; selected Portland metro cameras offer limited 60-second "live streaming" sessions
- This should be the backbone of the Oregon dashboard

2. Oregon Hazards Lab / ALERTWest
- Strong statewide wildfire and visibility layer
- Oregon Hazards Lab says it operated 70 wildfire cameras across Oregon as of October 2025
- Public users can watch live feeds, review timelapses, and view panoramic images taken every 2 minutes
- Public still-image endpoint pattern is documented for named cameras, which is useful for dashboard ingestion
- Media/public reuse is allowed with credit, which makes this source especially practical

3. PGE WildfireWatch
- Public portal launched July 29, 2025
- Nearly 40 cameras around Portland and surrounding areas
- Useful as a Portland-region wildfire and utility-risk layer
- Likely should be a dedicated adapter because it is a separate network and UX

4. Oregon DEQ Wait-line Cameras
- Small source, but clean and useful
- Public real-time entryway cameras for Portland-area Clean Air Stations
- Good example of a service-operations camera category beyond transportation and wildfire

5. NWS Marine / Bar Cameras and Observations
- Useful for Oregon coast and marine safety
- National Weather Service pages expose Washington and Oregon bar cameras and observations
- These are valuable for a coastal operations mode even if the count is smaller

### Tier 2: Add after v1 source review

- Oregon ports and harbor webcams
- Public airport webcams
- City or county traffic cameras not already covered by TripCheck
- University, tourism, ski, surf, and mountain webcams with explicit public-display permission

These likely require manual review because they are fragmented and terms vary.

## Non-camera Public Data We Should Monitor

The dashboard becomes much more useful if cameras are only one part of the story.

Recommended public data layers:

1. Traffic and road operations
- TripCheck incidents
- Local incidents from partner agencies
- Road/weather reports
- RWIS weather stations
- Travel detectors, speeds, volumes
- Chain restrictions and severe weather hazard segments
- DMS messages
- Multnomah Falls parking occupancy

2. Wildfire situation
- Wildfire camera locations and imagery
- Active fire perimeters
- Thermal hotspots where publicly available
- Smoke density / air quality overlays
- Evacuation links where official public data exists

3. Weather and environment
- NWS forecasts and alerts
- AirNow AQI and smoke data
- USGS river gauges and flood indicators
- NOAA marine observations, tides, and coastal conditions
- Earthquake feeds and tsunami alerts for coastal awareness

4. Transit and urban mobility
- TriMet real-time vehicles, arrivals, and alerts
- Park-and-ride or parking where public data exists
- Bike and pedestrian disruption notices where public feeds exist

## Product Positioning

This should not feel like a generic admin panel.

Design direction:

- Visual theme: Pacific Northwest operations room
- Tone: calm, high-contrast, weather-aware, field-usable
- Background: desaturated topo-map texture with subtle terrain gradients
- Accent colors:
  - Basalt `#1D252C`
  - Fog `#D9E1E8`
  - Moss `#637A5E`
  - Ember `#E16A3D`
  - Signal `#F2C14E`
  - Ice `#6FA8DC`
- Typography:
  - Headlines: `Space Grotesk`
  - UI/body: `IBM Plex Sans`
  - Metrics/ids: `IBM Plex Mono`

Motion:

- Gentle feed refresh pulse on updated tiles
- Staggered tile entrance on filter changes
- Smooth map-to-grid transitions
- No busy dashboards or casino-like animation

## Core Views

### 1. Statewide Command View

Default landing page.

Contains:

- Full Oregon map
- Camera density clusters
- Active incident overlays
- Wildfire and smoke overlays
- Region quick-jump chips
- Right rail with "watch now" camera stack

### 2. Area View

For Portland Metro, Mt. Hood, Central Oregon, Southern Oregon, Coast, Gorge, etc.

Contains:

- Map zoomed to region
- Grid of cameras in that area
- Area health summary
- Relevant road, weather, and fire conditions

### 3. Everything Grid

For users who want wallboard mode.

Contains:

- Dense camera tile layout
- Sort by newest update, region, source, hazard proximity, or popularity
- Auto-paging wallboard mode

### 4. Incident-Centric View

Instead of browsing cameras first, browse incidents first.

Contains:

- Incident list and timeline
- "Show nearest cameras" action
- Auto-suggested supporting data: weather, wind, closures, smoke

### 5. Coastal Ops View

Specialized Oregon coast mode.

Contains:

- Bar cameras
- Marine observations
- Tide and wave context
- Coastal alerts

## Filtering and Sorting

Users should be able to filter by:

- Region
- County
- City / landmark / corridor
- Source
- Category: traffic, wildfire, service, marine
- Media type: live video, pseudo-live, still image
- Refresh freshness
- Incident proximity
- Weather severity
- Availability status

Users should be able to sort by:

- Area
- Recently updated
- Nearest to incident
- Most watched
- Source
- Camera type

## Camera Tile Design

Each tile should show:

- Camera image or player
- Name
- Source badge
- County / area
- Last updated timestamp
- Media type badge: `Live`, `Animated`, `Still`
- Nearby incident chips
- Wind / temp if relevant
- Quick actions: expand, pin, compare, open source

Tile states:

- Healthy
- Stale
- Offline
- Permission-limited
- Night / low visibility

## Recommended UX Features

1. Smart Compare
- Open 2, 4, or 9 camera panels for one corridor, one incident, or one fire

2. Auto-follow Incident
- Pick a fire or crash and automatically load the nearest useful cameras and data layers

3. Saved Watchlists
- Examples: `I-84 Gorge`, `Portland Wildfire Edge`, `South Coast Bars`, `Mt. Hood Winter Travel`

4. Corridor Mode
- Treat a highway or river corridor as a first-class object
- Show ordered cameras, incidents, weather stations, and closures along the route

5. Playback for still-image sources
- For cameras that only refresh every few minutes, build a short recent-image scrubber if terms allow temporary caching

6. Feed Health Layer
- Monitor stale timestamps, missing images, blocked embeds, and broken publishers

7. Alert-driven layout
- Surface the most relevant cameras when wildfire, flood, marine, or severe weather thresholds trigger

## Data Model

Use one normalized `camera_sources` registry and one normalized `camera_feeds` table.

Suggested feed fields:

- `feed_id`
- `source_id`
- `provider_name`
- `name`
- `description`
- `state`
- `county`
- `region`
- `city`
- `latitude`
- `longitude`
- `tags`
- `category`
- `media_type`
- `current_image_url`
- `stream_url`
- `player_url`
- `source_page_url`
- `refresh_seconds`
- `embed_policy`
- `public_reuse_notes`
- `attribution_text`
- `terms_url`
- `status`
- `last_seen_at`
- `last_frame_at`

Suggested source fields:

- `source_id`
- `source_name`
- `owner`
- `adapter_type`
- `auth_required`
- `poll_interval_seconds`
- `supports_live`
- `supports_stills`
- `supports_history`
- `terms_review_status`
- `notes`

## Technical Architecture

Recommended stack:

- Frontend: Next.js
- UI: Tailwind plus a custom component layer
- Map: MapLibre GL
- Backend API: Next.js route handlers or small Node service
- Database: Postgres + PostGIS
- Jobs: cron-driven workers
- Cache: Redis
- Media proxy: image proxy with caching and attribution headers

### Adapter Pattern

Each source should have its own ingestion adapter:

- `tripcheckAdapter`
- `alertWestAdapter`
- `pgeWildfireAdapter`
- `deqAdapter`
- `nwsMarineAdapter`

Each adapter should output the same normalized shape.

### Ingestion Rules

- Poll inventory feeds less often than status feeds
- Store source metadata separately from frame freshness
- Never hotlink uncontrolled sources directly from the browser if rate limiting or CORS may break the UI
- Cache still images briefly
- For live players, prefer opening source-approved player URLs if embedding is fragile

### Recommended refresh cadences

- TripCheck camera inventory: daily
- TripCheck incidents: 30 seconds to 2 minutes depending on endpoint
- TripCheck weather and detector data: 2 to 5 minutes
- ALERTWest panorama freshness: about 2 minutes
- DEQ station cams: treat as near-real-time if accessible
- Feed health checks: 1 to 5 minutes

## Compliance and Safety

Every source needs a review record.

Checklist:

- Is the feed explicitly public?
- Is dashboard embedding allowed, or do we need to deep-link?
- Is caching allowed?
- Is attribution required?
- Is there a documented API or stable URL pattern?
- Are there robots, CSP, or anti-embed constraints?
- Are there privacy concerns, especially for cameras pointed at people rather than roads or landscapes?

Default policy:

- If terms are unclear, list the feed in the catalog but open it at the source site rather than embedding it
- Keep a per-source legal/terms note in the database

## Oregon v1 Build Plan

### Phase 0: Registry and review

- Build the source registry schema
- Add review workflow and source health checks
- Import Oregon regions, counties, and corridor definitions

### Phase 1: Oregon transportation and wildfire MVP

- TripCheck cameras
- TripCheck incidents and weather
- ALERTWest / OHAZ cameras
- Oregon region filters
- Statewide map + everything grid + area view

Success condition:

- A user can browse Oregon by area and reliably open the best public camera coverage in a few clicks

### Phase 2: Situational awareness expansion

- PGE WildfireWatch
- DEQ service cameras
- NWS marine cameras and observations
- Air quality, smoke, river, weather, and alerts overlays
- Smart compare and watchlists

### Phase 3: High-value operational features

- Incident auto-follow
- Corridor mode
- Temporary replay for still cameras
- Wallboard mode
- User favorites and saved layouts

### Phase 4: Catalog expansion

- Curated Oregon ports, resorts, airports, and local jurisdictions
- Washington / Idaho / California expansion using the same adapter model

## Recommended Desktop Layout

```text
+----------------------------------------------------------------------------------+
| Oregon Public Monitor | Search | Region Chips | Layers | Alert Summary           |
+-----------------------------+--------------------------------------+-------------+
| Left Rail                   | Main Map / Selected Area             | Watch Rail  |
| - Saved views               | - camera clusters                    | - pinned cams|
| - Source filters            | - incidents                          | - compare    |
| - Hazard filters            | - smoke / weather / fire overlays    | - nearest    |
| - Media type                | - click cluster -> grid              | - stale feeds|
+-----------------------------+--------------------------------------+-------------+
| Camera Grid / Timeline / Incident Table                                         |
| Large responsive tiles with freshness, source, and quick compare                |
+----------------------------------------------------------------------------------+
```

## Sharp Product Opinion

The strongest version of this product is not "every webcam in Oregon."

The strongest version is:

- Oregon public operations monitor
- camera-first
- incident-aware
- map-native
- source-governed
- fast enough for real use during weather, fire, and travel events

That positioning gives us a coherent product instead of a messy webcam directory.

## Immediate Next Step

If we move from planning into implementation, the first concrete deliverable should be:

1. A source registry with five Oregon adapters
2. A seeded Oregon regions/corridors model
3. A homepage with `Statewide`, `Area`, and `Everything` modes
4. TripCheck + ALERTWest as the first live integrations

## Research Links

- TripCheck API: https://www.tripcheck.com/Pages/API
- TripCheck FAQ: https://www.tripcheck.com/Pages/Frequently-Asked-Questions
- ODOT TripCheck API portal: https://apiportal.odot.state.or.us/product/tripcheck-data-api
- Oregon Hazards Lab wildfire cameras: https://ohaz.uoregon.edu/wildfire-cameras/
- Oregon Hazards Lab media toolkit: https://ohaz.uoregon.edu/media-toolkit/
- ALERTWest: https://alertwest.live/
- PGE wildfire camera public portal announcement: https://portlandgeneral.com/news/2025-07-public-can-now-access-wildfire-monitoring-camera-network
- PGE WildfireWatch: https://portlandgeneral.wildfirewatch.com/
- Oregon DEQ wait-line cameras: https://www.oregon.gov/deq/vehicle-inspection/pages/web-cameras.aspx
- NWS marine page for Oregon and Washington bar cameras/observations: https://www.weather.gov/mfr/marine
- NWS API docs: https://www.weather.gov/documentation/services-web-api
- AirNow API: https://docs.airnowapi.org/
- USGS Water Data APIs: https://api.waterdata.usgs.gov/
- USGS earthquake feeds: https://earthquake.usgs.gov/earthquakes/feed/
- Oregon wildfire portal: https://wildfire.oregon.gov/pages/default.aspx

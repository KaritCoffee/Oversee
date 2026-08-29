# Privacy And Data Handling

Oversee is a local-first viewer. The dashboard UI and its Node data adapter run on `127.0.0.1`; Oversee does not require an Oversee account and does not send telemetry to an Oversee service.

## Public Network Requests

The local adapter requests public camera catalogs, media, maps, weather, alerts, aircraft, satellite, earthquake, wildfire, population, and other enabled data directly from the providers identified in the Sources drawer. Provider logs and terms still apply to those requests.

## API Keys

Optional keys entered in Settings are stored in the current user's local Oversee configuration as plain text. They are sent only from the local adapter to the corresponding provider. They are masked in the UI, omitted from diagnostic exports, and are not included in Git commits.

Do not paste a credential you are not permitted to use. Rotate a key through its provider if the computer or configuration file is compromised.

Release builds do not bundle API credentials. Each recipient can add their own optional keys through Settings; a developer's local configuration is never copied into an installer.

## Local Data

Oversee stores bounded public-feed cache data, source-health observations, watch areas, pinned items, and short situational history locally so the app can remain useful through brief upstream outages. Removing the app does not necessarily remove that user data unless the installer option to delete application data is selected.

Camera feeds are best effort. Opening a feed can connect to the originating agency, CDN, or public video host, which can receive the normal network metadata associated with that request.

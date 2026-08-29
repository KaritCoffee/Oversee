{
  "title": "Oversee additional official public camera and situational source research",
  "generated_at": "2026-05-03",
  "language": "en-US",
  "format_version": "1.0",
  "scope": {
    "objective": "Identify additional lawful official or public camera sources, prioritizing structured inventories and direct media endpoints, with emphasis on central US, mountain west, southwest, rural US, Germany/Europe, Latin America, Caribbean, Asia, Africa, and Oceania.",
    "existing_sources_acknowledged": [
      "NYC DOT",
      "Caltrans",
      "TfL JamCams",
      "Iowa DOT",
      "Ireland TII",
      "Toronto",
      "Florida 511",
      "Georgia DOT",
      "KYTC/Indiana",
      "PennDOT",
      "Redmond",
      "Lawrence",
      "Spain DGT",
      "Madrid open data",
      "Hong Kong",
      "Panama Canal",
      "OSU webcams",
      "CelesTrak",
      "OpenSky",
      "USGS earthquakes",
      "NWS alerts",
      "NASA FIRMS",
      "EGP/WFIGS",
      "FEMA flood",
      "NOAA radar",
      "Census ACS",
      "NHC",
      "GDELT Cuba context"
    ]
  },
  "executive_summary": {
    "best_new_sources": [
      {
        "source_name": "Illinois Gateway Traffic Cameras",
        "why_it_stands_out": "Best verified no-key structured US addition in this pass. Official ArcGIS/OGC dataset with roughly 3,600+ rows and explicit image path field, making it strong for direct geospatial ingestion and deduping.",
        "coverage": "Illinois Gateway / metro and statewide connected coverage",
        "implementation_priority": "High",
        "citations": [
          "citeturn36search0turn36search1"
        ]
      },
      {
        "source_name": "511 Wisconsin API",
        "why_it_stands_out": "Official documented camera API with latitude, longitude, image URL, and live VideoUrl fields. Strong browser and backend integration candidate once a free developer key is issued.",
        "coverage": "Wisconsin statewide, 500+ cameras",
        "implementation_priority": "High",
        "citations": [
          "citeturn27view0turn27view1turn34search26"
        ]
      },
      {
        "source_name": "511 Louisiana API",
        "why_it_stands_out": "Official documented camera endpoint with JSON/XML, coordinates, per-view metadata, and explicit HLS VideoUrl examples. One of the cleanest southern US camera APIs found.",
        "coverage": "Louisiana statewide",
        "implementation_priority": "High",
        "citations": [
          "citeturn11view3turn7search0"
        ]
      },
      {
        "source_name": "NDRoads cameras GeoJSON",
        "why_it_stands_out": "Excellent rural Great Plains gap filler with official camera GeoJSON and image links, plus matching ArcGIS REST/WMS/KML ecosystem. The main caution is the public-facing use restriction.",
        "coverage": "North Dakota statewide",
        "implementation_priority": "Medium",
        "citations": [
          "citeturn27view3turn7search6"
        ]
      },
      {
        "source_name": "NZTA Traffic APIs",
        "why_it_stands_out": "Strong Oceania addition. Official SOAP and REST traffic endpoints with documented camera methods and over 100 traffic cameras.",
        "coverage": "New Zealand statewide",
        "implementation_priority": "High",
        "citations": [
          "citeturn24view1turn24view3"
        ]
      },
      {
        "source_name": "NSW Live Traffic Cameras API",
        "why_it_stands_out": "Clean official open-data camera feed with downloadable JSON and CKAN API support, useful for Australia and for a repeatable state-level ingestion pattern.",
        "coverage": "New South Wales",
        "implementation_priority": "High",
        "citations": [
          "citeturn24view0"
        ]
      },
      {
        "source_name": "Civil IoT Taiwan CCTV",
        "why_it_stands_out": "Large official Asia inventory with real-time CCTV image APIs and more than 1,000 stations across WRA-maintained sets alone.",
        "coverage": "Taiwan, especially water-resource and disaster-monitoring cameras",
        "implementation_priority": "High",
        "citations": [
          "citeturn41view0turn41view1"
        ]
      },
      {
        "source_name": "Statens vegvesen DATEX CCTV",
        "why_it_stands_out": "Best verified official Europe road-camera API in this pass outside Spain. DATEX II is particularly attractive if Oversee already normalizes XML transport feeds.",
        "coverage": "Norway national and county roads",
        "implementation_priority": "High",
        "citations": [
          "citeturn41view3turn25search7turn25search11"
        ]
      },
      {
        "source_name": "Austin Traffic Cameras open data",
        "why_it_stands_out": "Fastest Texas structured win. Official Socrata dataset for live traffic cameras and suitable for simple SODA ingestion.",
        "coverage": "Austin, Texas",
        "implementation_priority": "High",
        "citations": [
          "citeturn33search0turn33search24"
        ]
      },
      {
        "source_name": "Puerto Rico Traffic Cameras",
        "why_it_stands_out": "Official Caribbean government traffic-camera source with a public list of camera pages. Valuable regional gap filler near Cuba and the broader Caribbean context.",
        "coverage": "San Juan metro and Puerto Rico highways",
        "implementation_priority": "High",
        "citations": [
          "citeturn18view0turn17search2"
        ]
      }
    ],
    "core_findings": [
      {
        "statement": "The strongest high-confidence net-new additions are official camera APIs or semi-structured feeds from Illinois, Wisconsin, Louisiana, North Dakota, New South Wales, New Zealand, Taiwan, Norway, Austin, and Puerto Rico. These are the best places to add camera inventory depth quickly with low integration uncertainty.",
        "citations": [
          "citeturn36search0turn36search1turn27view0turn27view1turn11view3turn27view3turn24view0turn24view1turn41view0turn41view1turn41view3turn33search0turn18view0"
        ]
      },
      {
        "statement": "Germany remains comparatively weak for machine-friendly official traffic-camera APIs in this pass. The best verified official road-camera entry point is Bavaria's BayernInfo, while Berlin, Munich, Stuttgart, and Kaiserslautern are mainly official source-page webcams rather than structured feeds.",
        "citations": [
          "citeturn14search7turn15search0turn14search3turn15search1turn15search18"
        ]
      },
      {
        "statement": "Several high-value US sources exist but are not truly frictionless: Colorado CoTrip requires credentials and a user agreement for XML feeds, VDOT video feeds require an agreement with Iteris, and North Carolina and Wisconsin require free developer keys with throttling.",
        "citations": [
          "citeturn28search4turn39view0turn40view0turn27view1"
        ]
      },
      {
        "statement": "For rural and mountain-west coverage, North Dakota, Wyoming, Colorado, Kansas, Missouri, and Montana are the most promising verified official additions found here, but only North Dakota and Colorado surfaced clearly documented structured access during this pass.",
        "citations": [
          "citeturn27view3turn28search4turn7search3turn31search0turn38search4turn5search6"
        ]
      },
      {
        "statement": "A cautious backend-proxy pattern is advisable for nearly every feed in this set because many agencies either do not document CORS, rotate image URLs, serve HLS or per-view pages, or explicitly discourage direct public consumption of raw ETL feeds.",
        "citations": [
          "citeturn27view3turn25search10turn39view0"
        ]
      }
    ]
  },
  "high_priority_implementation_shortlist": [
    {
      "region": "Illinois",
      "source_name": "Illinois Gateway Traffic Cameras",
      "official_url": "https://gis-idot.opendata.arcgis.com/datasets/illinois-gateway-traffic-cameras",
      "api_or_catalog_url": "https://gis-idot.opendata.arcgis.com/datasets/8a885da23dfb46caaa1827ad920fb5b1_0/geoservice",
      "example_query_url": null,
      "data_format": [
        "ArcGIS REST",
        "OGC API",
        "open data table"
      ],
      "approx_camera_count": 3645,
      "media_access_type": [
        "refreshed stills"
      ],
      "coordinate_fields": [
        "geometry"
      ],
      "media_url_fields": [
        "ImgPath"
      ],
      "rate_limits_or_key": "No key visible on the dataset pages.",
      "implementation_priority": "High",
      "notes": "Best structured Illinois addition verified in this pass. Start by harvesting features from the ArcGIS geoservice and normalize ImgPath into your media_url field.",
      "citations": [
        "citeturn36search0turn36search1turn36search3"
      ]
    },
    {
      "region": "Wisconsin",
      "source_name": "511 Wisconsin API",
      "official_url": "https://511wi.gov/developers/help",
      "api_or_catalog_url": "https://511wi.gov/api/getcameras?key={key}&format={format}",
      "example_query_url": "https://511wi.gov/api/getcameras?key=YOUR_KEY&format=json",
      "data_format": [
        "JSON",
        "XML"
      ],
      "approx_camera_count": 500,
      "media_access_type": [
        "direct live video",
        "refreshed stills"
      ],
      "coordinate_fields": [
        "Latitude",
        "Longitude"
      ],
      "media_url_fields": [
        "Url",
        "VideoUrl"
      ],
      "rate_limits_or_key": "Free developer key required. Throttling: 10 calls per 60 seconds.",
      "implementation_priority": "High",
      "notes": "One of the cleanest US APIs found. In Node, poll on a server schedule, store full camera inventory in PostGIS or SQLite, and proxy media URLs to avoid browser breakage.",
      "citations": [
        "citeturn27view0turn27view1turn34search26"
      ]
    },
    {
      "region": "Louisiana",
      "source_name": "511LA camera API",
      "official_url": "https://www.511la.org/help/endpoint/cameras",
      "api_or_catalog_url": "https://511la.org/api/v2/get/cameras",
      "example_query_url": "https://511la.org/api/v2/get/cameras?key=YOUR_KEY&format=json",
      "data_format": [
        "JSON",
        "XML"
      ],
      "approx_camera_count": null,
      "media_access_type": [
        "HLS",
        "source view URL"
      ],
      "coordinate_fields": [
        "Latitude",
        "Longitude"
      ],
      "media_url_fields": [
        "Views[].Url",
        "Views[].VideoUrl"
      ],
      "rate_limits_or_key": "Free developer key required. Throttling: 10 calls per 60 seconds.",
      "implementation_priority": "High",
      "notes": "Very strong southern US source. The example response explicitly shows per-camera HLS playlist URLs, which is ideal for Oversee if you already support m3u8 playback.",
      "citations": [
        "citeturn11view3turn7search0"
      ]
    },
    {
      "region": "North Dakota",
      "source_name": "NDRoads cameras GeoJSON",
      "official_url": "https://www.dot.nd.gov/construction-and-planning/planning-process/gis-and-mapping/web-map-services",
      "api_or_catalog_url": "https://travelfiles.dot.nd.gov/geojson_nc/cameras.json",
      "example_query_url": "https://travelfiles.dot.nd.gov/geojson_nc/cameras.json",
      "data_format": [
        "GeoJSON",
        "ArcGIS REST",
        "WMS",
        "KML"
      ],
      "approx_camera_count": null,
      "media_access_type": [
        "links to camera images"
      ],
      "coordinate_fields": [
        "GeoJSON geometry"
      ],
      "media_url_fields": [
        "camera image link fields in GeoJSON feature properties"
      ],
      "rate_limits_or_key": "No key. Official guidance says do not download faster than every 5 minutes.",
      "implementation_priority": "Medium",
      "notes": "Excellent rural Great Plains coverage. Important caution: the official page says these files are for ETL purposes only and should not be consumed directly in a public-facing application, so use a backend cache and review legal fit before shipping.",
      "citations": [
        "citeturn27view3turn7search6"
      ]
    },
    {
      "region": "Colorado",
      "source_name": "CoTrip XML camera feed",
      "official_url": "https://data.colorado.gov/Transportation/Traffic-Feeds-in-Colorado/b9sn-ryu7",
      "api_or_catalog_url": "https://data.cotrip.org/xml/cameras.xml",
      "example_query_url": "https://username:password@data.cotrip.org/xml/cameras.xml",
      "data_format": [
        "XML"
      ],
      "approx_camera_count": null,
      "media_access_type": [
        "camera images via XML feed"
      ],
      "coordinate_fields": [
        "camera feed schema fields, not re-expanded in this pass"
      ],
      "media_url_fields": [
        "camera feed schema fields, not re-expanded in this pass"
      ],
      "rate_limits_or_key": "Username and password required after agreement.",
      "implementation_priority": "Medium",
      "notes": "High-value mountain west source, but not frictionless. Best implemented as a backend XML pull job with credential vaulting and feed-to-JSON normalization.",
      "citations": [
        "citeturn28search0turn28search2turn28search4"
      ]
    },
    {
      "region": "Texas",
      "source_name": "City of Austin Traffic Cameras open data",
      "official_url": "https://data.austintexas.gov/Transportation-and-Mobility/Traffic-Cameras/b4k4-adkb",
      "api_or_catalog_url": "https://data.austintexas.gov/Transportation-and-Mobility/Traffic-Cameras/b4k4-adkb",
      "example_query_url": "https://data.austintexas.gov/resource/b4k4-adkb.json",
      "data_format": [
        "Socrata",
        "JSON",
        "CSV"
      ],
      "approx_camera_count": null,
      "media_access_type": [
        "live traffic camera images"
      ],
      "coordinate_fields": [
        "dataset fields not expanded in this pass"
      ],
      "media_url_fields": [
        "dataset fields not expanded in this pass"
      ],
      "rate_limits_or_key": "No key visible on the official dataset page.",
      "implementation_priority": "High",
      "notes": "Fastest structured Texas win. The example SODA endpoint is inferred from the official Socrata dataset identifier and should be verified against current schema before prod rollout.",
      "citations": [
        "citeturn33search0turn33search24"
      ]
    },
    {
      "region": "Texas statewide",
      "source_name": "TxDOT metro live traffic camera pages",
      "official_url": "https://www.txdot.gov/discover/live-traffic-cameras.html",
      "api_or_catalog_url": null,
      "example_query_url": null,
      "data_format": [
        "source-page-only"
      ],
      "approx_camera_count": null,
      "media_access_type": [
        "live camera footage",
        "source-page-only"
      ],
      "coordinate_fields": null,
      "media_url_fields": null,
      "rate_limits_or_key": "No key visible.",
      "implementation_priority": "Medium",
      "notes": "Not a preferred structured source, but it fills major Texas gaps quickly. Best harvested only if you can verify that each metro page exposes stable public media URLs and terms allow reuse.",
      "citations": [
        "citeturn33search13"
      ]
    },
    {
      "region": "North Carolina",
      "source_name": "DriveNC API",
      "official_url": "https://nc.prod.traveliq.co/developers/doc",
      "api_or_catalog_url": "https://nc.prod.traveliq.co/developers/doc",
      "example_query_url": null,
      "data_format": [
        "JSON",
        "vendor REST"
      ],
      "approx_camera_count": null,
      "media_access_type": [
        "camera inventory via API"
      ],
      "coordinate_fields": [
        "camera fields not re-expanded in this pass"
      ],
      "media_url_fields": [
        "camera fields not re-expanded in this pass"
      ],
      "rate_limits_or_key": "Free developer key required. Throttling: 10 calls per 60 seconds.",
      "implementation_priority": "High",
      "notes": "Official NCDOT-backed camera API docs are verified, but the exact camera endpoint path was not re-opened in this pass. Treat this as a high-confidence near-term integration candidate rather than a copy-paste-ready endpoint.",
      "citations": [
        "citeturn40view0"
      ]
    },
    {
      "region": "Virginia",
      "source_name": "VDOT 511 traffic feed video",
      "official_url": "https://www.vdot.virginia.gov/news-events/media/",
      "api_or_catalog_url": "Agreement-managed via Iteris; API formats available after onboarding",
      "example_query_url": null,
      "data_format": [
        "streaming formats via API",
        "web portal"
      ],
      "approx_camera_count": null,
      "media_access_type": [
        "direct live video",
        "streaming formats via API"
      ],
      "coordinate_fields": null,
      "media_url_fields": null,
      "rate_limits_or_key": "User agreement required. Free for internal use or free public distribution; resale available for a fee.",
      "implementation_priority": "Medium",
      "notes": "Very valuable official source for Virginia, but not low-friction. If Oversee wants Virginia, this is a partnership-style integration rather than a simple scrape or anonymous API pull.",
      "citations": [
        "citeturn39view0"
      ]
    },
    {
      "region": "Kansas",
      "source_name": "KanDrive",
      "official_url": "https://kandrive.gov/",
      "api_or_catalog_url": null,
      "example_query_url": null,
      "data_format": [
        "source-page-only"
      ],
      "approx_camera_count": null,
      "media_access_type": [
        "highway camera live footage",
        "source-page-only"
      ],
      "coordinate_fields": null,
      "media_url_fields": null,
      "rate_limits_or_key": "No key visible.",
      "implementation_priority": "Medium",
      "notes": "Useful central US gap filler, but I did not verify a public structured camera endpoint in this pass. Good fallback if you accept page-level extraction after terms review.",
      "citations": [
        "citeturn31search0turn31search2turn31search9"
      ]
    },
    {
      "region": "Missouri",
      "source_name": "MoDOT Traveler Information Map",
      "official_url": "https://traveler.modot.org/",
      "api_or_catalog_url": null,
      "example_query_url": null,
      "data_format": [
        "source-page-only"
      ],
      "approx_camera_count": null,
      "media_access_type": [
        "traffic cameras",
        "source-page-only"
      ],
      "coordinate_fields": null,
      "media_url_fields": null,
      "rate_limits_or_key": "No key visible.",
      "implementation_priority": "Medium",
      "notes": "Missouri is worth adding for central US coverage, but this pass did not surface a documented public camera API. Treat as a UI/source-page candidate pending endpoint discovery.",
      "citations": [
        "citeturn38search4turn38search9turn38search14"
      ]
    },
    {
      "region": "Wyoming",
      "source_name": "WYDOT 511 web cameras",
      "official_url": "https://www.wyoroad.info/highway/webcameras/webcameras.html",
      "api_or_catalog_url": null,
      "example_query_url": "https://www.wyoroad.info/Highway/webcameras/all?route=I80Cameras",
      "data_format": [
        "HTML listings"
      ],
      "approx_camera_count": null,
      "media_access_type": [
        "web camera images",
        "route pages"
      ],
      "coordinate_fields": null,
      "media_url_fields": null,
      "rate_limits_or_key": "No key visible.",
      "implementation_priority": "Medium",
      "notes": "High-value rural and mountain-pass source. Good for winter and freight corridors, but structured endpoint details were not verified here.",
      "citations": [
        "citeturn7search3turn7search7turn7search15"
      ]
    },
    {
      "region": "Puerto Rico",
      "source_name": "Puerto Rico Highways and Transportation Authority traffic cameras",
      "official_url": "https://its.act.pr.gov/en/TrafficCameras.aspx",
      "api_or_catalog_url": null,
      "example_query_url": null,
      "data_format": [
        "camera list pages"
      ],
      "approx_camera_count": 30,
      "media_access_type": [
        "camera pages",
        "source-page-only"
      ],
      "coordinate_fields": null,
      "media_url_fields": null,
      "rate_limits_or_key": "No key visible.",
      "implementation_priority": "High",
      "notes": "Strong Caribbean government source near your Cuba-adjacent context. The public English page lists many individual cameras, but a bulk API was not verified in this pass.",
      "citations": [
        "citeturn18view0turn17search2"
      ]
    },
    {
      "region": "New South Wales, Australia",
      "source_name": "Live Traffic Cameras API",
      "official_url": "https://data.nsw.gov.au/data/dataset/2-live-traffic-cameras/resource/0adb9db3-f7a0-47b7-bd34-d70e9e001d42",
      "api_or_catalog_url": "https://opendata.transport.nsw.gov.au/data/dataset/b0212311-b0da-4363-8dc3-825fe10941b2/resource/cc776d1a-d96c-4ae4-a465-c380a53717c9/download/livetrafficcamera.json",
      "example_query_url": "https://data.nsw.gov.au/data/api/action/datastore_search?resource_id=0adb9db3-f7a0-47b7-bd34-d70e9e001d42&limit=5",
      "data_format": [
        "JSON",
        "CKAN datastore API"
      ],
      "approx_camera_count": null,
      "media_access_type": [
        "current images"
      ],
      "coordinate_fields": [
        "dataset records contain location fields, not fully expanded in this pass"
      ],
      "media_url_fields": [
        "dataset records contain current image fields, not fully expanded in this pass"
      ],
      "rate_limits_or_key": "Public download URL visible. CKAN API examples reference Authorization token support.",
      "implementation_priority": "High",
      "notes": "Excellent Oceania source. Use the JSON download as your first integration target and only move to CKAN filter queries if you need server-side search.",
      "citations": [
        "citeturn24view0"
      ]
    },
    {
      "region": "New Zealand",
      "source_name": "NZTA Traffic APIs",
      "official_url": "https://www.nzta.govt.nz/traffic-and-travel-information/use-our-data/about-the-apis",
      "api_or_catalog_url": "https://trafficnz.info/service/traffic/rest/4",
      "example_query_url": "https://trafficnz.info/service/traffic/rest/4?_wadl",
      "data_format": [
        "REST",
        "SOAP",
        "WADL"
      ],
      "approx_camera_count": 100,
      "media_access_type": [
        "static images"
      ],
      "coordinate_fields": [
        "camera methods return geospatial scope by region, journey, bounds, and all cameras"
      ],
      "media_url_fields": [
        "camera methods not re-expanded in this pass"
      ],
      "rate_limits_or_key": "No key requirement was shown on the API information page.",
      "implementation_priority": "High",
      "notes": "Very strong fit for Oversee. The API surface explicitly includes findCamerasAll, findCamerasByRegion, findCamerasByJourney, and bounds-based discovery.",
      "citations": [
        "citeturn24view1turn24view3"
      ]
    },
    {
      "region": "Taiwan",
      "source_name": "Civil IoT Taiwan CCTV",
      "official_url": "https://ci.taiwan.gov.tw/dsp/Views/_EN/dataset/cctv.aspx",
      "api_or_catalog_url": "https://ci.taiwan.gov.tw/dsp/Views/_EN/dataset/detail.aspx?id=cctv_2",
      "example_query_url": null,
      "data_format": [
        "API",
        "dataset catalog"
      ],
      "approx_camera_count": 1042,
      "media_access_type": [
        "CCTV image"
      ],
      "coordinate_fields": [
        "station/location fields available in the platform, not re-expanded in this pass"
      ],
      "media_url_fields": [
        "CCTV image"
      ],
      "rate_limits_or_key": "No key requirement was visible on the English dataset page.",
      "implementation_priority": "High",
      "notes": "One of the biggest official Asia finds in this pass. Prioritize WRA CCTV station feeds first because they are real-time and clearly described.",
      "citations": [
        "citeturn41view0turn41view1"
      ]
    },
    {
      "region": "Singapore",
      "source_name": "Traffic Images API",
      "official_url": "https://data.gov.sg/datasets/d_6cdb6b405b25aaaacbaf7689bcc6fae0/view",
      "api_or_catalog_url": "https://api.data.gov.sg/v1/transport/traffic-images",
      "example_query_url": "https://api.data.gov.sg/v1/transport/traffic-images",
      "data_format": [
        "JSON"
      ],
      "approx_camera_count": null,
      "media_access_type": [
        "refreshed stills"
      ],
      "coordinate_fields": [
        "camera locations"
      ],
      "media_url_fields": [
        "image links"
      ],
      "rate_limits_or_key": "API key required for higher limits. The April 2026 LTA guide says image links are valid for 5 minutes only.",
      "implementation_priority": "High",
      "notes": "Good Asia metro source. Use aggressive URL refresh logic because image URLs are short-lived.",
      "citations": [
        "citeturn25search22turn25search10"
      ]
    },
    {
      "region": "Norway",
      "source_name": "Statens vegvesen DATEX CCTV",
      "official_url": "https://www.vegvesen.no/en/fag/technology/open-data/a-selection-of-open-data/what-is-datex/",
      "api_or_catalog_url": "https://dataut.vegvesen.no/en/dataset/webkamera",
      "example_query_url": null,
      "data_format": [
        "DATEX II XML"
      ],
      "approx_camera_count": null,
      "media_access_type": [
        "webcamera images"
      ],
      "coordinate_fields": [
        "location publications in DATEX node"
      ],
      "media_url_fields": [
        "camera image publications"
      ],
      "rate_limits_or_key": "Free, but the agency notes that you must register to use the links.",
      "implementation_priority": "High",
      "notes": "Best verified official Europe road-camera feed found in this pass. If Oversee already parses DATEX, this should be a strong addition.",
      "citations": [
        "citeturn41view3turn25search7turn25search11"
      ]
    },
    {
      "region": "Bavaria, Germany",
      "source_name": "BayernInfo traffic cameras",
      "official_url": "https://www.bayerninfo.de/en/",
      "api_or_catalog_url": null,
      "example_query_url": null,
      "data_format": [
        "official source page"
      ],
      "approx_camera_count": 570,
      "media_access_type": [
        "traffic camera images"
      ],
      "coordinate_fields": null,
      "media_url_fields": null,
      "rate_limits_or_key": "No key visible.",
      "implementation_priority": "Medium",
      "notes": "Best verified official Germany road-camera source in this pass, especially relevant for Munich and Bavarian motorways. Structured API details were not verified.",
      "citations": [
        "citeturn14search7"
      ]
    },
    {
      "region": "Berlin, Germany",
      "source_name": "Berlin.de webcams",
      "official_url": "https://www.berlin.de/en/webcams/",
      "api_or_catalog_url": null,
      "example_query_url": null,
      "data_format": [
        "official source page"
      ],
      "approx_camera_count": 2,
      "media_access_type": [
        "city webcams",
        "source-page-only"
      ],
      "coordinate_fields": null,
      "media_url_fields": null,
      "rate_limits_or_key": "No key visible.",
      "implementation_priority": "Low",
      "notes": "Useful for Berlin urban context, but this is not a structured road-camera API. Good only if Oversee wants official city visual context layers.",
      "citations": [
        "citeturn15search0turn15search12"
      ]
    },
    {
      "region": "Munich, Germany",
      "source_name": "Munich city webcams",
      "official_url": "https://www.muenchen.de/en/sights/webcam-live-munich-marienplatz-olympiapark-and-more",
      "api_or_catalog_url": null,
      "example_query_url": null,
      "data_format": [
        "official source page"
      ],
      "approx_camera_count": 4,
      "media_access_type": [
        "city webcams",
        "source-page-only"
      ],
      "coordinate_fields": null,
      "media_url_fields": null,
      "rate_limits_or_key": "No key visible.",
      "implementation_priority": "Low",
      "notes": "Official city tourism webcams, useful for Munich context but not a traffic API.",
      "citations": [
        "citeturn14search3turn14search6"
      ]
    },
    {
      "region": "Stuttgart, Germany",
      "source_name": "Stuttgart city webcam",
      "official_url": "https://www.stuttgart.de/en/tourismus/stadtportraet/stuttgarter-webcams",
      "api_or_catalog_url": null,
      "example_query_url": null,
      "data_format": [
        "official source page"
      ],
      "approx_camera_count": 1,
      "media_access_type": [
        "webcam updated once a minute"
      ],
      "coordinate_fields": null,
      "media_url_fields": null,
      "rate_limits_or_key": "No key visible.",
      "implementation_priority": "Low",
      "notes": "Official city webcam rather than structured inventory. Useful only as an auxiliary Germany city context layer.",
      "citations": [
        "citeturn15search1"
      ]
    },
    {
      "region": "Kaiserslautern, Germany",
      "source_name": "Kaiserslautern City Hall webcams",
      "official_url": "https://www.kaiserslautern.de/service/webcam/index.html.en",
      "api_or_catalog_url": null,
      "example_query_url": null,
      "data_format": [
        "official source page"
      ],
      "approx_camera_count": null,
      "media_access_type": [
        "city hall webcam player"
      ],
      "coordinate_fields": null,
      "media_url_fields": null,
      "rate_limits_or_key": "No key visible.",
      "implementation_priority": "Low",
      "notes": "Official local context source near Kaiserslautern and Ramstein area, but not a road-camera dataset.",
      "citations": [
        "citeturn15search18"
      ]
    },
    {
      "region": "Barbados",
      "source_name": "National Conservation Commission beach cams",
      "official_url": "https://www.nccbarbados.com/beach-cams/",
      "api_or_catalog_url": null,
      "example_query_url": null,
      "data_format": [
        "official page embeds"
      ],
      "approx_camera_count": 14,
      "media_access_type": [
        "embedded cams"
      ],
      "coordinate_fields": null,
      "media_url_fields": null,
      "rate_limits_or_key": "No key visible.",
      "implementation_priority": "Medium",
      "notes": "Useful Caribbean tourism and coastal conditions layer from a government source. Verify whether the page embeds direct stream URLs or third-party iframe players before launch.",
      "citations": [
        "citeturn18view1"
      ]
    },
    {
      "region": "South Africa",
      "source_name": "SANParks webcams",
      "official_url": "https://www.sanparks.org/travel/webcams/overview",
      "api_or_catalog_url": null,
      "example_query_url": null,
      "data_format": [
        "official page",
        "stills",
        "video"
      ],
      "approx_camera_count": 8,
      "media_access_type": [
        "refreshed stills",
        "video with cache delay"
      ],
      "coordinate_fields": null,
      "media_url_fields": null,
      "rate_limits_or_key": "No key visible.",
      "implementation_priority": "Medium",
      "notes": "Official Africa addition with both still and video wildlife cameras. Stills update every few minutes; video is cached locally and can run about 10 minutes behind.",
      "citations": [
        "citeturn23view0"
      ]
    }
  ],
  "full_structured_table": [
    {
      "region_country_state_city": "Illinois, US",
      "source_name": "Illinois Gateway Traffic Cameras",
      "official_url": "https://gis-idot.opendata.arcgis.com/datasets/illinois-gateway-traffic-cameras",
      "api_catalog_endpoint_url": "https://gis-idot.opendata.arcgis.com/datasets/8a885da23dfb46caaa1827ad920fb5b1_0/geoservice",
      "example_query_url": null,
      "data_format": "ArcGIS REST / OGC API / open data table",
      "approximate_camera_count": 3645,
      "live_type": "Refreshed stills",
      "coordinate_fields": "geometry",
      "media_url_fields": "ImgPath",
      "cors_browser_embedding_notes": "CORS not documented on the dataset page. Conservative choice is backend proxy + cache.",
      "rate_limits_api_key_requirements": "No key visible on official pages.",
      "license_terms_notes": "Open data portal distribution; specific downstream image terms should still be checked before public redistribution at scale.",
      "reliability_notes": "High-confidence structured inventory; very strong ingestion candidate.",
      "implementation_priority": "High",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Query ArcGIS features, map ImgPath to normalized media_url, store geometry as GeoJSON, and refresh inventory daily with media URL health checks.",
      "citations": [
        "citeturn36search0turn36search1turn36search3"
      ]
    },
    {
      "region_country_state_city": "Wisconsin, US",
      "source_name": "511 Wisconsin API",
      "official_url": "https://511wi.gov/developers/help",
      "api_catalog_endpoint_url": "https://511wi.gov/api/getcameras?key={key}&format={format}",
      "example_query_url": "https://511wi.gov/api/getcameras?key=YOUR_KEY&format=json",
      "data_format": "JSON / XML",
      "approximate_camera_count": 500,
      "live_type": "Direct live video plus refreshed stills",
      "coordinate_fields": "Latitude, Longitude",
      "media_url_fields": "Url, VideoUrl",
      "cors_browser_embedding_notes": "Not documented. Use a server-side fetch/proxy for predictable playback and browser compatibility.",
      "rate_limits_api_key_requirements": "Free developer key required; 10 calls per 60 seconds.",
      "license_terms_notes": "Developer access agreement exists.",
      "reliability_notes": "High-confidence official API and one of the best Midwest additions.",
      "implementation_priority": "High",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Poll inventory with retry/backoff; prefer inventory sync every few hours and media health probes separately to stay within throttle limits.",
      "citations": [
        "citeturn27view0turn27view1turn34search26"
      ]
    },
    {
      "region_country_state_city": "Louisiana, US",
      "source_name": "511LA camera API",
      "official_url": "https://www.511la.org/help/endpoint/cameras",
      "api_catalog_endpoint_url": "https://511la.org/api/v2/get/cameras",
      "example_query_url": "https://511la.org/api/v2/get/cameras?key=YOUR_KEY&format=json",
      "data_format": "JSON / XML",
      "approximate_camera_count": null,
      "live_type": "HLS plus per-view source URLs",
      "coordinate_fields": "Latitude, Longitude",
      "media_url_fields": "Views[].Url, Views[].VideoUrl",
      "cors_browser_embedding_notes": "HLS can usually be handled through hls.js or native Safari playback; backend proxy still recommended.",
      "rate_limits_api_key_requirements": "Free developer key required; 10 calls per 60 seconds.",
      "license_terms_notes": "Official public developer API documentation.",
      "reliability_notes": "Very strong official southern US source with explicit camera schema.",
      "implementation_priority": "High",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Flatten camera + views into one internal record per view, keep HLS URL and preview URL separately, and expose both map popups and player modal support.",
      "citations": [
        "citeturn11view3turn7search0"
      ]
    },
    {
      "region_country_state_city": "North Dakota, US",
      "source_name": "NDRoads cameras GeoJSON",
      "official_url": "https://www.dot.nd.gov/construction-and-planning/planning-process/gis-and-mapping/web-map-services",
      "api_catalog_endpoint_url": "https://travelfiles.dot.nd.gov/geojson_nc/cameras.json",
      "example_query_url": "https://travelfiles.dot.nd.gov/geojson_nc/cameras.json",
      "data_format": "GeoJSON plus ArcGIS REST/WMS/KML ecosystem",
      "approximate_camera_count": null,
      "live_type": "Links to camera images",
      "coordinate_fields": "GeoJSON geometry",
      "media_url_fields": "Feature properties with image links",
      "cors_browser_embedding_notes": "Not documented.",
      "rate_limits_api_key_requirements": "No key; do not download faster than every 5 minutes.",
      "license_terms_notes": "Important restriction: official page says ETL only and not to be consumed directly in any public-facing application.",
      "reliability_notes": "Excellent rural coverage, but licensing/use-profile risk is real for a public dashboard.",
      "implementation_priority": "Medium",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "If used, ingest server-side only, cache snapshots and metadata, and consider seeking written permission before exposing raw feed-driven public features.",
      "citations": [
        "citeturn27view3turn7search6"
      ]
    },
    {
      "region_country_state_city": "Colorado, US",
      "source_name": "CoTrip XML cameras feed",
      "official_url": "https://data.colorado.gov/Transportation/Traffic-Feeds-in-Colorado/b9sn-ryu7",
      "api_catalog_endpoint_url": "https://data.cotrip.org/xml/cameras.xml",
      "example_query_url": "https://username:password@data.cotrip.org/xml/cameras.xml",
      "data_format": "XML",
      "approximate_camera_count": null,
      "live_type": "Camera feed described in official XML feed catalog",
      "coordinate_fields": "XML schema, not re-expanded in this pass",
      "media_url_fields": "XML schema, not re-expanded in this pass",
      "cors_browser_embedding_notes": "Not documented; treat as backend-only feed.",
      "rate_limits_api_key_requirements": "Username/password after agreement.",
      "license_terms_notes": "Credentialed access rather than anonymous open pull.",
      "reliability_notes": "High-value mountain west source, but not frictionless.",
      "implementation_priority": "Medium",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Use xml2js or fast-xml-parser in a server job, convert to a normalized JSON schema, and do not expose feed credentials client-side.",
      "citations": [
        "citeturn28search0turn28search2turn28search4"
      ]
    },
    {
      "region_country_state_city": "Austin, Texas, US",
      "source_name": "City of Austin Traffic Cameras open data",
      "official_url": "https://data.austintexas.gov/Transportation-and-Mobility/Traffic-Cameras/b4k4-adkb",
      "api_catalog_endpoint_url": "https://data.austintexas.gov/Transportation-and-Mobility/Traffic-Cameras/b4k4-adkb",
      "example_query_url": "https://data.austintexas.gov/resource/b4k4-adkb.json",
      "data_format": "Socrata / JSON / CSV",
      "approximate_camera_count": null,
      "live_type": "Live traffic camera images",
      "coordinate_fields": "Dataset fields not re-expanded in this pass",
      "media_url_fields": "Dataset fields not re-expanded in this pass",
      "cors_browser_embedding_notes": "Socrata APIs are generally workable server-side; use proxy/cache if media is cross-origin or hotlinked.",
      "rate_limits_api_key_requirements": "No key visible on official dataset page.",
      "license_terms_notes": "Open data dataset; verify image reuse terms if production redistribution matters.",
      "reliability_notes": "Best structured Texas source found in this pass.",
      "implementation_priority": "High",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Treat the SODA JSON as the camera inventory source and preserve original IDs for dedupe against future TxDOT or regional feeds.",
      "citations": [
        "citeturn33search0turn33search24"
      ]
    },
    {
      "region_country_state_city": "Texas statewide, US",
      "source_name": "TxDOT metro live traffic camera pages",
      "official_url": "https://www.txdot.gov/discover/live-traffic-cameras.html",
      "api_catalog_endpoint_url": null,
      "example_query_url": null,
      "data_format": "Source-page-only",
      "approximate_camera_count": null,
      "live_type": "Live camera footage via metro pages",
      "coordinate_fields": null,
      "media_url_fields": null,
      "cors_browser_embedding_notes": "Unknown; likely mixed by metro implementation.",
      "rate_limits_api_key_requirements": "No key visible.",
      "license_terms_notes": "TxDOT states footage is not recorded and is for real-time monitoring only.",
      "reliability_notes": "Good statewide Texas gap filler but much less integration-friendly than Austin's open dataset.",
      "implementation_priority": "Medium",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Only pursue after verifying whether underlying metro pages expose stable image or stream URLs and whether public redistribution is acceptable.",
      "citations": [
        "citeturn33search13"
      ]
    },
    {
      "region_country_state_city": "North Carolina, US",
      "source_name": "DriveNC camera API",
      "official_url": "https://nc.prod.traveliq.co/developers/doc",
      "api_catalog_endpoint_url": "https://nc.prod.traveliq.co/developers/doc",
      "example_query_url": null,
      "data_format": "REST API docs",
      "approximate_camera_count": null,
      "live_type": "API-driven camera inventory",
      "coordinate_fields": "Not re-expanded in this pass",
      "media_url_fields": "Not re-expanded in this pass",
      "cors_browser_embedding_notes": "Not documented.",
      "rate_limits_api_key_requirements": "Free developer key required; 10 calls per 60 seconds.",
      "license_terms_notes": "Official developer portal.",
      "reliability_notes": "Strong official API candidate, but exact camera endpoint details still need a final implementation check.",
      "implementation_priority": "High",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Follow the same adapter pattern as Louisiana and Wisconsin once the exact camera endpoint and schema are confirmed.",
      "citations": [
        "citeturn40view0"
      ]
    },
    {
      "region_country_state_city": "Virginia, US",
      "source_name": "VDOT 511 video subscription feeds",
      "official_url": "https://www.vdot.virginia.gov/news-events/media/",
      "api_catalog_endpoint_url": "Agreement-managed via Iteris after request",
      "example_query_url": null,
      "data_format": "Integrated web portal and streaming formats via API",
      "approximate_camera_count": null,
      "live_type": "Direct live video",
      "coordinate_fields": null,
      "media_url_fields": null,
      "cors_browser_embedding_notes": "Not documented; partner-style integration likely preferred.",
      "rate_limits_api_key_requirements": "User agreement required; access coordinated through Iteris.",
      "license_terms_notes": "Free for internal use or free public distribution; resale fee option also exists.",
      "reliability_notes": "High-value but not low-friction.",
      "implementation_priority": "Medium",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Treat as a business-process integration, not a blind API pull. Keep feed metadata and entitlement state on the server.",
      "citations": [
        "citeturn39view0"
      ]
    },
    {
      "region_country_state_city": "Kansas, US",
      "source_name": "KanDrive",
      "official_url": "https://kandrive.gov/",
      "api_catalog_endpoint_url": null,
      "example_query_url": "https://www.kandrive.gov/list/cameras",
      "data_format": "HTML map and list pages",
      "approximate_camera_count": null,
      "live_type": "Highway camera live footage",
      "coordinate_fields": null,
      "media_url_fields": null,
      "cors_browser_embedding_notes": "Unknown",
      "rate_limits_api_key_requirements": "No key visible.",
      "license_terms_notes": "Official public traveler information source.",
      "reliability_notes": "Good central US coverage, but machine-readable camera inventory was not verified.",
      "implementation_priority": "Medium",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Suitable for a later HTML-to-endpoint reconnaissance step, not ideal as a first-wave API integration.",
      "citations": [
        "citeturn31search0turn31search2turn31search9"
      ]
    },
    {
      "region_country_state_city": "Missouri, US",
      "source_name": "MoDOT Traveler Information Map",
      "official_url": "https://traveler.modot.org/",
      "api_catalog_endpoint_url": null,
      "example_query_url": null,
      "data_format": "Web map / source-page-only",
      "approximate_camera_count": null,
      "live_type": "Traffic cameras on traveler map",
      "coordinate_fields": null,
      "media_url_fields": null,
      "cors_browser_embedding_notes": "Unknown",
      "rate_limits_api_key_requirements": "No key visible.",
      "license_terms_notes": "Official public traveler map.",
      "reliability_notes": "Useful state coverage, but structured camera endpoint was not verified here.",
      "implementation_priority": "Medium",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Keep in backlog unless a hidden JSON or ArcGIS endpoint is later surfaced.",
      "citations": [
        "citeturn38search4turn38search9turn38search14"
      ]
    },
    {
      "region_country_state_city": "Wyoming, US",
      "source_name": "WYDOT 511 web cameras",
      "official_url": "https://www.wyoroad.info/highway/webcameras/webcameras.html",
      "api_catalog_endpoint_url": null,
      "example_query_url": "https://www.wyoroad.info/Highway/webcameras/all?route=I80Cameras",
      "data_format": "HTML route listings",
      "approximate_camera_count": null,
      "live_type": "Road camera images",
      "coordinate_fields": null,
      "media_url_fields": null,
      "cors_browser_embedding_notes": "Unknown",
      "rate_limits_api_key_requirements": "No key visible.",
      "license_terms_notes": "Official statewide camera site.",
      "reliability_notes": "High-value mountain and freight corridor source, but not yet verified as a structured API.",
      "implementation_priority": "Medium",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Good candidate for route-based page parsing if terms permit; better if a hidden data feed is later found.",
      "citations": [
        "citeturn7search3turn7search7turn7search15"
      ]
    },
    {
      "region_country_state_city": "Puerto Rico",
      "source_name": "Puerto Rico traffic cameras",
      "official_url": "https://its.act.pr.gov/en/TrafficCameras.aspx",
      "api_catalog_endpoint_url": null,
      "example_query_url": null,
      "data_format": "Official camera list pages",
      "approximate_camera_count": 30,
      "live_type": "Individual camera pages",
      "coordinate_fields": null,
      "media_url_fields": null,
      "cors_browser_embedding_notes": "Unknown",
      "rate_limits_api_key_requirements": "No key visible.",
      "license_terms_notes": "Official Puerto Rico Highways and Transportation Authority page.",
      "reliability_notes": "Strong Caribbean government source; structured bulk endpoint not verified in this pass.",
      "implementation_priority": "High",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Use the list page as seed inventory, then inspect per-camera pages for direct image or stream URLs before deciding whether to ship.",
      "citations": [
        "citeturn18view0turn17search2"
      ]
    },
    {
      "region_country_state_city": "New South Wales, Australia",
      "source_name": "Live Traffic Cameras API",
      "official_url": "https://data.nsw.gov.au/data/dataset/2-live-traffic-cameras/resource/0adb9db3-f7a0-47b7-bd34-d70e9e001d42",
      "api_catalog_endpoint_url": "https://opendata.transport.nsw.gov.au/data/dataset/b0212311-b0da-4363-8dc3-825fe10941b2/resource/cc776d1a-d96c-4ae4-a465-c380a53717c9/download/livetrafficcamera.json",
      "example_query_url": "https://data.nsw.gov.au/data/api/action/datastore_search?resource_id=0adb9db3-f7a0-47b7-bd34-d70e9e001d42&limit=5",
      "data_format": "JSON / CKAN API",
      "approximate_camera_count": null,
      "live_type": "Current camera images",
      "coordinate_fields": "Dataset location fields, not fully expanded in this pass",
      "media_url_fields": "Current image fields, not fully expanded in this pass",
      "cors_browser_embedding_notes": "Not documented.",
      "rate_limits_api_key_requirements": "Public download URL visible; advanced API uses CKAN datastore patterns.",
      "license_terms_notes": "NSW open data portal distribution.",
      "reliability_notes": "Excellent official Australia source.",
      "implementation_priority": "High",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Use JSON download for nightly full sync and optionally add CKAN filtered queries for search UI or region-specific backend jobs.",
      "citations": [
        "citeturn24view0"
      ]
    },
    {
      "region_country_state_city": "New Zealand",
      "source_name": "NZTA Traffic APIs",
      "official_url": "https://www.nzta.govt.nz/traffic-and-travel-information/use-our-data/about-the-apis",
      "api_catalog_endpoint_url": "https://trafficnz.info/service/traffic/rest/4",
      "example_query_url": "https://trafficnz.info/service/traffic/rest/4?_wadl",
      "data_format": "REST / SOAP",
      "approximate_camera_count": 100,
      "live_type": "Static images",
      "coordinate_fields": "findCamerasAll / ByRegion / ByJourney / WithinBounds methods",
      "media_url_fields": "Camera method outputs, not re-expanded in this pass",
      "cors_browser_embedding_notes": "Not documented; backend integration preferred.",
      "rate_limits_api_key_requirements": "No key requirement shown on official page.",
      "license_terms_notes": "Official NZTA traffic API service.",
      "reliability_notes": "One of the strongest official Oceania additions.",
      "implementation_priority": "High",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Wrap the REST service first, then decide whether SOAP adds anything you need. Region and bounds methods fit Oversee's map viewport fetch model.",
      "citations": [
        "citeturn24view1turn24view3"
      ]
    },
    {
      "region_country_state_city": "Taiwan",
      "source_name": "Civil IoT Taiwan CCTV",
      "official_url": "https://ci.taiwan.gov.tw/dsp/Views/_EN/dataset/cctv.aspx",
      "api_catalog_endpoint_url": "https://ci.taiwan.gov.tw/dsp/Views/_EN/dataset/detail.aspx?id=cctv_2",
      "example_query_url": null,
      "data_format": "API catalog",
      "approximate_camera_count": 1042,
      "live_type": "CCTV images",
      "coordinate_fields": "Station/location fields available in platform, not fully expanded in this pass",
      "media_url_fields": "CCTV image",
      "cors_browser_embedding_notes": "Unknown",
      "rate_limits_api_key_requirements": "No key requirement visible on the English catalog page.",
      "license_terms_notes": "Open Government Data License, version 1.0 for the WRA CCTV dataset.",
      "reliability_notes": "High-value Asia disaster and water-resource camera network.",
      "implementation_priority": "High",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Start with WRA CCTV station feeds, map station IDs to normalized camera IDs, and separate water-resource cameras from transportation cameras in your taxonomy.",
      "citations": [
        "citeturn41view0turn41view1"
      ]
    },
    {
      "region_country_state_city": "Singapore",
      "source_name": "Traffic Images API",
      "official_url": "https://data.gov.sg/datasets/d_6cdb6b405b25aaaacbaf7689bcc6fae0/view",
      "api_catalog_endpoint_url": "https://api.data.gov.sg/v1/transport/traffic-images",
      "example_query_url": "https://api.data.gov.sg/v1/transport/traffic-images",
      "data_format": "JSON",
      "approximate_camera_count": null,
      "live_type": "Refreshed stills",
      "coordinate_fields": "Location fields",
      "media_url_fields": "Image links",
      "cors_browser_embedding_notes": "Because image links expire quickly, Oversee should front them through a refresh-aware backend.",
      "rate_limits_api_key_requirements": "API key for higher rate limits; image links valid for 5 minutes according to the 2026 guide.",
      "license_terms_notes": "Singapore Open Data / DataMall terms apply.",
      "reliability_notes": "Strong official Asia metro camera source with URL expiry behavior.",
      "implementation_priority": "High",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Never persist the image URL as long-lived truth. Persist camera ID + location, then fetch fresh image URLs at display time or on a short cache TTL.",
      "citations": [
        "citeturn25search22turn25search10"
      ]
    },
    {
      "region_country_state_city": "Norway",
      "source_name": "Statens vegvesen DATEX CCTV",
      "official_url": "https://www.vegvesen.no/en/fag/technology/open-data/a-selection-of-open-data/what-is-datex/",
      "api_catalog_endpoint_url": "https://dataut.vegvesen.no/en/dataset/webkamera",
      "example_query_url": null,
      "data_format": "DATEX II XML",
      "approximate_camera_count": null,
      "live_type": "Webcamera images",
      "coordinate_fields": "Published through DATEX location publications",
      "media_url_fields": "Camera image publications",
      "cors_browser_embedding_notes": "Use backend XML parsing and URL extraction.",
      "rate_limits_api_key_requirements": "Free service, but registration is required to use the links.",
      "license_terms_notes": "Official open-data service; cite NPRA when using weather publications per the page.",
      "reliability_notes": "Strong Europe road-camera source, but registration adds light friction.",
      "implementation_priority": "High",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "DATEX fits a scheduled ETL job. Parse XML, flatten camera publications, and map them into your common feed schema with country='NO'.",
      "citations": [
        "citeturn41view3turn25search7turn25search11"
      ]
    },
    {
      "region_country_state_city": "Bavaria, Germany",
      "source_name": "BayernInfo traffic cameras",
      "official_url": "https://www.bayerninfo.de/en/",
      "api_catalog_endpoint_url": null,
      "example_query_url": null,
      "data_format": "Official site / source-page-only",
      "approximate_camera_count": 570,
      "live_type": "Traffic camera images",
      "coordinate_fields": null,
      "media_url_fields": null,
      "cors_browser_embedding_notes": "Unknown",
      "rate_limits_api_key_requirements": "No key visible.",
      "license_terms_notes": "Official Bavarian traffic information service.",
      "reliability_notes": "Best verified Germany road-camera source found in this pass.",
      "implementation_priority": "Medium",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Use as a Germany pilot zone if you are comfortable with source-page integration while continuing to look for a formal API or ArcGIS layer.",
      "citations": [
        "citeturn14search7"
      ]
    },
    {
      "region_country_state_city": "Berlin, Germany",
      "source_name": "Berlin.de webcams",
      "official_url": "https://www.berlin.de/en/webcams/",
      "api_catalog_endpoint_url": null,
      "example_query_url": null,
      "data_format": "Official city webcam page",
      "approximate_camera_count": 2,
      "live_type": "City webcams",
      "coordinate_fields": null,
      "media_url_fields": null,
      "cors_browser_embedding_notes": "Unknown",
      "rate_limits_api_key_requirements": "No key visible.",
      "license_terms_notes": "Official city website content.",
      "reliability_notes": "Useful for civic context, not traffic API work.",
      "implementation_priority": "Low",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Only worthwhile if Oversee wants official city context cams beyond roads.",
      "citations": [
        "citeturn15search0turn15search12"
      ]
    },
    {
      "region_country_state_city": "Munich, Germany",
      "source_name": "Munich city webcams",
      "official_url": "https://www.muenchen.de/en/sights/webcam-live-munich-marienplatz-olympiapark-and-more",
      "api_catalog_endpoint_url": null,
      "example_query_url": null,
      "data_format": "Official city webcam page",
      "approximate_camera_count": 4,
      "live_type": "City webcams",
      "coordinate_fields": null,
      "media_url_fields": null,
      "cors_browser_embedding_notes": "Unknown",
      "rate_limits_api_key_requirements": "No key visible.",
      "license_terms_notes": "Official city tourism content.",
      "reliability_notes": "Good Munich visual context, not structured transport data.",
      "implementation_priority": "Low",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Keep separate from road-camera taxonomy if added.",
      "citations": [
        "citeturn14search3turn14search6"
      ]
    },
    {
      "region_country_state_city": "Stuttgart, Germany",
      "source_name": "Stuttgart city webcam",
      "official_url": "https://www.stuttgart.de/en/tourismus/stadtportraet/stuttgarter-webcams",
      "api_catalog_endpoint_url": null,
      "example_query_url": null,
      "data_format": "Official city webcam page",
      "approximate_camera_count": 1,
      "live_type": "Webcam updated once a minute",
      "coordinate_fields": null,
      "media_url_fields": null,
      "cors_browser_embedding_notes": "Unknown",
      "rate_limits_api_key_requirements": "No key visible.",
      "license_terms_notes": "Official city tourism content.",
      "reliability_notes": "Useful only as a city context cam.",
      "implementation_priority": "Low",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Not worth prioritizing over official road feeds elsewhere.",
      "citations": [
        "citeturn15search1"
      ]
    },
    {
      "region_country_state_city": "Kaiserslautern, Germany",
      "source_name": "Kaiserslautern City Hall webcams",
      "official_url": "https://www.kaiserslautern.de/service/webcam/index.html.en",
      "api_catalog_endpoint_url": null,
      "example_query_url": null,
      "data_format": "Official city webcam page",
      "approximate_camera_count": null,
      "live_type": "Player-based city webcams",
      "coordinate_fields": null,
      "media_url_fields": null,
      "cors_browser_embedding_notes": "Unknown",
      "rate_limits_api_key_requirements": "No key visible.",
      "license_terms_notes": "Official city content.",
      "reliability_notes": "Only useful for Kaiserslautern/Ramstein area context.",
      "implementation_priority": "Low",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Implement only if local Germany context is strategically important for your users.",
      "citations": [
        "citeturn15search18"
      ]
    },
    {
      "region_country_state_city": "Barbados",
      "source_name": "National Conservation Commission beach cams",
      "official_url": "https://www.nccbarbados.com/beach-cams/",
      "api_catalog_endpoint_url": null,
      "example_query_url": null,
      "data_format": "Official page embeds",
      "approximate_camera_count": 14,
      "live_type": "Embedded cams",
      "coordinate_fields": null,
      "media_url_fields": null,
      "cors_browser_embedding_notes": "Likely iframe or embed-driven; verify direct media URLs before integration.",
      "rate_limits_api_key_requirements": "No key visible.",
      "license_terms_notes": "Government of Barbados page; third-party embedded player terms may also apply.",
      "reliability_notes": "Useful Caribbean scenic/coastal layer.",
      "implementation_priority": "Medium",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Treat these as tourism/coastal cameras, not transport cameras, and verify whether direct image endpoints exist behind embeds.",
      "citations": [
        "citeturn18view1"
      ]
    },
    {
      "region_country_state_city": "South Africa",
      "source_name": "SANParks webcams",
      "official_url": "https://www.sanparks.org/travel/webcams/overview",
      "api_catalog_endpoint_url": null,
      "example_query_url": null,
      "data_format": "Official stills and video pages",
      "approximate_camera_count": 8,
      "live_type": "Refreshed stills and delayed video",
      "coordinate_fields": null,
      "media_url_fields": null,
      "cors_browser_embedding_notes": "Unknown",
      "rate_limits_api_key_requirements": "No key visible.",
      "license_terms_notes": "Official South African National Parks terms apply.",
      "reliability_notes": "Good official Africa addition with clear still and video behavior.",
      "implementation_priority": "Medium",
      "duplicate_overlap_with_existing": "No direct overlap with your current list.",
      "node_javascript_app_notes": "Add as a wildlife/park category. Label video as delayed because the official page says local file cache can cause about a 10-minute difference.",
      "citations": [
        "citeturn23view0"
      ]
    }
  ],
  "node_js_integration_blueprint": {
    "recommended_normalized_schema": {
      "id": "stable agency camera or feature identifier",
      "source": "human-readable source name",
      "region": "state/country/city",
      "name": "camera name",
      "lat": "number|null",
      "lon": "number|null",
      "bbox": "optional for map viewport or non-point feeds",
      "page_url": "official page URL",
      "inventory_url": "official API/catalog URL",
      "preview_image_url": "latest still image if available",
      "stream_url": "HLS/MP4/MJPEG if available",
      "stream_type": "hls|mjpeg|mp4|iframe|page_only|still_only",
      "status": "active|disabled|blocked|unknown",
      "updated_at": "source update time if available",
      "license_notes": "plain-text terms reminder",
      "restrictions": "rate/key/use restrictions",
      "raw": "original source payload for debugging"
    },
    "recommended_adapter_order": [
      "ArcGIS and GeoJSON sources first",
      "Socrata sources next",
      "Documented JSON/XML camera APIs next",
      "DATEX/XML sources next",
      "Source-page-only and embed-only sources last"
    ],
    "implementation_rules": [
      "Always pull inventories server-side, not directly from the browser.",
      "Proxy media URLs when CORS is unknown, URLs are short-lived, or a feed is HLS/MJPEG and needs consistent access control.",
      "Separate inventory refresh from media health refresh. Inventory can run every 30 to 360 minutes; media validation can run more frequently for active sources.",
      "Keep original source IDs and URLs to simplify dedupe and terms audits.",
      "Store a source-level policy object with key requirements, throttle ceilings, and public-facing restrictions.",
      "For source-page-only cameras, mark them as lower-trust and keep extraction logic isolated from first-party API adapters."
    ],
    "special_cases": [
      {
        "source_name": "Singapore Traffic Images API",
        "rule": "Do not persist image URLs as durable identifiers because official docs say links are valid for 5 minutes only.",
        "citations": [
          "citeturn25search10turn25search22"
        ]
      },
      {
        "source_name": "NDRoads GeoJSON",
        "rule": "Use only via server-side ETL and legal review because the official page says these files are for ETL only and not to be consumed directly in public-facing apps.",
        "citations": [
          "citeturn27view3"
        ]
      },
      {
        "source_name": "VDOT and CoTrip",
        "rule": "Treat as credentialed integrations managed through agreements, not anonymously discoverable public APIs.",
        "citations": [
          "citeturn39view0turn28search4"
        ]
      }
    ]
  },
  "non_camera_situational_apis_to_add_next": [
    {
      "source_name": "North Carolina WZDx",
      "official_url": "https://nc.prod.traveliq.co/api/wzdx",
      "why_add_next": "Natural companion to DriveNC cameras for work-zone overlays and route-impact context.",
      "citations": [
        "citeturn40view0"
      ]
    },
    {
      "source_name": "NDRoads alerts, roads, workzones, ESS, and WZDx GeoJSON",
      "official_url": "https://www.dot.nd.gov/construction-and-planning/planning-process/gis-and-mapping/web-map-services",
      "why_add_next": "Gives you coherent road-conditions, closures, work zones, and environmental sensor layers alongside North Dakota cameras.",
      "citations": [
        "citeturn27view3"
      ]
    },
    {
      "source_name": "NZTA traffic conditions, road events, VMS, and journeys APIs",
      "official_url": "https://www.nzta.govt.nz/traffic-and-travel-information/use-our-data/about-the-apis",
      "why_add_next": "Cameras are only one part of a broader travel API surface that fits Oversee well.",
      "citations": [
        "citeturn24view1"
      ]
    },
    {
      "source_name": "NSW CKAN and transport open-data layers beyond cameras",
      "official_url": "https://data.nsw.gov.au/data/",
      "why_add_next": "NSW camera data sits inside a broader road and traffic open-data ecosystem that can enrich incidents and closures.",
      "citations": [
        "citeturn24view0turn19search12"
      ]
    },
    {
      "source_name": "DriveTexas road conditions API",
      "official_url": "https://api.drivetexas.org/",
      "why_add_next": "The official page explicitly says it provides road conditions rather than live camera data, so it is a good situational add-on for Texas even though it does not solve your camera gap directly.",
      "citations": [
        "citeturn33search7"
      ]
    },
    {
      "source_name": "Norway DATEX weather and travel-time publications",
      "official_url": "https://www.vegvesen.no/en/fag/technology/open-data/a-selection-of-open-data/what-is-datex/",
      "why_add_next": "Useful to pair European camera images with weather and road-traffic context in one standards-based pipeline.",
      "citations": [
        "citeturn41view3"
      ]
    }
  ],
  "duplicate_or_avoid_list": [
    {
      "item": "Do not spend implementation time on sources you already have live unless you want a better adapter.",
      "details": [
        "Georgia 511",
        "Spain DGT",
        "Madrid camera open data",
        "Hong Kong traffic snapshot images",
        "Caltrans",
        "Florida 511",
        "Iowa DOT",
        "PennDOT"
      ],
      "citations": [
        "citeturn31search5turn26search0turn26search3turn41view4"
      ]
    },
    {
      "item": "Avoid unofficial mirrors and aggregators as primary sources.",
      "details": [
        "TrafficVision",
        "traffic-cams.com",
        "WeatherBug traffic cams",
        "EarthCam mirrors",
        "commercial webcam indexes"
      ],
      "reason": "They can be useful for discovery, but they are not authoritative, can lag or rehost content, and may not respect agency terms.",
      "citations": [
        "citeturn14search0turn17search15turn15search4turn34search19"
      ]
    },
    {
      "item": "Avoid direct browser consumption of North Dakota ETL feeds.",
      "details": [
        "The official page says these files are for ETL purposes only and not to be consumed directly in a public-facing application."
      ],
      "citations": [
        "citeturn27view3"
      ]
    },
    {
      "item": "Avoid private or security-sensitive camera sources even when technically visible.",
      "details": [
        "No insecure RTSP/ONVIF endpoints",
        "No Shodan-style discoveries",
        "No hacked or unintentionally public devices"
      ],
      "reason": "This matches your stated lawful-source constraint and avoids major terms, privacy, and security issues.",
      "citations": []
    },
    {
      "item": "Avoid Kenya Ports Authority cameras as a target until policy is clear.",
      "details": [
        "Recent reporting says KPA warned staff against recording videos or taking photos at port facilities."
      ],
      "reason": "That is not a clear green light for public camera reuse.",
      "citations": [
        "citeturn22search9turn22search17"
      ]
    }
  ],
  "open_questions_limitations": [
    {
      "question": "Ohio, Michigan, Tennessee, Alabama, Mississippi, Oklahoma, Nebraska, Arkansas, South Carolina, West Virginia, and much of Germany likely have usable official camera sources, but in this pass I did not re-verify enough machine-friendly endpoint detail to recommend them as copy-paste-ready integrations.",
      "citations": [
        "citeturn30search1turn34search2turn8search4turn8search1turn7search1turn6search2turn13view2turn11view0turn8search3"
      ]
    },
    {
      "question": "Exact camera schemas for North Carolina, Colorado, and some ArcGIS-backed sources should still be sanity-checked with one implementation pass before you commit adapter code.",
      "citations": [
        "citeturn40view0turn28search4turn36search1"
      ]
    },
    {
      "question": "For official city and tourism webcams in Germany and the Caribbean, direct media endpoints were often not exposed in the searchable page text, so some of these entries are best treated as source-page-only until inspected more deeply.",
      "citations": [
        "citeturn15search0turn14search3turn15search1turn15search18turn18view1"
      ]
    }
  ]
}
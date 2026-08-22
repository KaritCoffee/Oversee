const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const vm = require("node:vm");

const ROOT = __dirname;
const APP_VERSION = "2.1.0";
const REQUESTED_PORT = Number(process.env.PORT || 4173);
const FALLBACK_PORTS = process.env.PORT ? [REQUESTED_PORT] : [4173, 4183, 4193, 4203, 4303];
const DATA = loadBrowserExport(path.join(ROOT, "assets", "data.js"), "OVERSEE_DATA");
const META = loadBrowserExport(path.join(ROOT, "assets", "feed-meta.js"), "OVERSEE_FEED_META");
const USER_CONFIG_PATH = process.env.OVERSEE_USER_CONFIG_PATH || path.join(process.env.LOCALAPPDATA || ROOT, "Oversee", "config.local.json");
const RUNTIME_CACHE_DIR = process.env.OVERSEE_CACHE_DIR || path.join(process.env.LOCALAPPDATA || ROOT, "Oversee", "cache");
const BUNDLED_CONFIG = loadBundledConfig();
const USER_CONFIG = loadUserConfig();
const LOCAL_CONFIG = { ...BUNDLED_CONFIG, ...USER_CONFIG };
const FEEDS_BY_ID = new Map(DATA.feeds.map((feed) => [feed.id, feed]));
const SOURCES_BY_ID = new Map(DATA.sources.map((source) => [source.id, source]));

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const SOURCE_URLS = {
  celestrakActive: "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json",
  celestrakVisual: "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json",
  openskyAll: "https://opensky-network.org/api/states/all",
  adsbLolPoint: "https://api.adsb.lol/v2/point",
  usgsQuakes: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
  usgsSignificantQuakes: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson",
  nwsAlerts: "https://api.weather.gov/alerts/active",
  nhcCurrentStorms: "https://www.nhc.noaa.gov/CurrentStorms.json",
  gdeltCubaDocs: "https://api.gdeltproject.org/api/v2/doc/doc",
  nasaFirmsArea: "https://firms.modaps.eosdis.nasa.gov/api/area/csv",
  egpIncidents: "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/EGP_Active_Incidents_Prod_Public_View/FeatureServer/0/query",
  egpPerimeters: "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query",
  censusAcsStatePopulation: "https://api.census.gov/data/2023/acs/acs5",
  nycTrafficCameras: "https://webcams.nyctmc.org/api/cameras",
  tflJamCams: "https://api.tfl.gov.uk/Place/Type/JamCam",
  nasaGibsWms: "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi",
  minnesota511Cameras: "https://mntg.carsprogram.org/cameras_v1/api/cameras",
  coloradoCotripCameras: "https://cotg.carsprogram.org/cameras_v1/api/cameras",
  nebraska511Cameras: "https://netg.carsprogram.org/cameras_v1/api/cameras",
  kansas511Cameras: "https://kstg.carsprogram.org/cameras_v1/api/cameras",
  northDakotaCameras: "https://travelfiles.dot.nd.gov/geojson_nc/cameras.json",
  ontario511Cameras: "https://511on.ca/api/v2/get/cameras?format=json",
  alberta511Cameras: "https://511.alberta.ca/api/v2/get/cameras?format=json",
  hongKongTrafficCameras: "https://opendata.esrichina.hk/datasets/bdfd0ca3f731412d81391d00b721bd08_0.geojson?where=1%3D1",
  madridTrafficKml: "http://datos.madrid.es/egob/catalogo/202088-0-trafico-camaras.kml",
  spainDgtCameras: "https://nap.dgt.es/datex2/v3/dgt/DevicePublication/camaras_datex2_v36.xml",
  fintrafficWeathercams: "https://tie.digitraffic.fi/api/weathercam/v1/stations",
  fintrafficWeathercamData: "https://tie.digitraffic.fi/api/weathercam/v1/stations/data",
  missouriSnapshots: "https://traveler.modot.org/map/js/snapshot.json",
  arizonaListCameras: "https://az511.com/List/GetData/Cameras",
  austinTrafficCameras: "https://data.austintexas.gov/resource/b4k4-adkb.json",
  singaporeTrafficImages: "https://api.data.gov.sg/v1/transport/traffic-images",
  nztaTrafficCameras: "https://trafficnz.info/service/traffic/rest/4/cameras/all",
  nswTrafficCameras: "https://api.transport.nsw.gov.au/v1/live/cameras",
  wisconsin511Cameras: "https://511wi.gov/api/v2/get/cameras",
  louisiana511Cameras: "https://511la.org/api/v2/get/cameras",
  driveNcCameras: "https://nc.prod.traveliq.co/api/v2/get/cameras",
};

const GIBS_TEXTURES = {
  nasa: {
    layer: "MODIS_Terra_CorrectedReflectance_TrueColor",
    format: "image/jpeg",
    width: 2048,
    height: 1024,
  },
};

const CURATED_PUBLIC_CAMERAS = [
  {
    id: "de-kaiserslautern-japanese-garden-1",
    name: "Kaiserslautern Japanese Garden 1",
    area: "Kaiserslautern",
    region: "Rhineland-Palatinate",
    county: "Kaiserslautern",
    country: "Germany",
    category: "city",
    sourceName: "City of Kaiserslautern Webcams",
    officialUrl: "https://www.kaiserslautern.de/service/webcam/",
    imageUrl: "https://www.japanischergarten.de/webcam/cam1/kamera1.jpg",
    lat: 49.4431,
    lng: 7.7689,
  },
  {
    id: "de-kaiserslautern-japanese-garden-2",
    name: "Kaiserslautern Japanese Garden 2",
    area: "Kaiserslautern",
    region: "Rhineland-Palatinate",
    county: "Kaiserslautern",
    country: "Germany",
    category: "city",
    sourceName: "City of Kaiserslautern Webcams",
    officialUrl: "https://www.kaiserslautern.de/service/webcam/",
    imageUrl: "https://www.japanischergarten.de/webcam/cam2/kamera2.jpg",
    lat: 49.4431,
    lng: 7.7689,
  },
  {
    id: "de-kaiserslautern-japanese-garden-3",
    name: "Kaiserslautern Japanese Garden 3",
    area: "Kaiserslautern",
    region: "Rhineland-Palatinate",
    county: "Kaiserslautern",
    country: "Germany",
    category: "city",
    sourceName: "City of Kaiserslautern Webcams",
    officialUrl: "https://www.kaiserslautern.de/service/webcam/",
    imageUrl: "https://www.japanischergarten.de/webcam/cam3/kamera3.jpg",
    lat: 49.4431,
    lng: 7.7689,
  },
  {
    id: "de-kaiserslautern-japanese-garden-4",
    name: "Kaiserslautern Japanese Garden 4",
    area: "Kaiserslautern",
    region: "Rhineland-Palatinate",
    county: "Kaiserslautern",
    country: "Germany",
    category: "city",
    sourceName: "City of Kaiserslautern Webcams",
    officialUrl: "https://www.kaiserslautern.de/service/webcam/",
    imageUrl: "https://www.japanischergarten.de/webcam/cam4/kamera4.jpg",
    lat: 49.4431,
    lng: 7.7689,
  },
  {
    id: "de-berlin-red-town-hall",
    name: "Berlin Red Town Hall",
    area: "Berlin",
    region: "Berlin",
    county: "Berlin",
    country: "Germany",
    category: "city",
    sourceName: "Berlin.de Webcams",
    officialUrl: "https://www.berlin.de/en/webcams/",
    imageUrl: "https://www.berlin.de/webcams/rathaus/webcam.jpg",
    lat: 52.5186,
    lng: 13.4083,
  },
  {
    id: "cu-havana-worldcamera",
    name: "Havana Public Webcam Listing",
    area: "Havana",
    region: "La Habana",
    county: "Havana",
    country: "Cuba",
    category: "city",
    sourceName: "WorldCamera Cuba",
    officialUrl: "https://worldcamera.net/en/webcams/caribic/cuba",
    sourcePageUrl: "https://worldcamera.net/en/webcams/caribic/cuba",
    lat: 23.1136,
    lng: -82.3666,
    sourceOnly: true,
  },
  {
    id: "cu-varadero-worldcamera",
    name: "Varadero Public Webcam Listing",
    area: "Varadero",
    region: "Matanzas",
    county: "Matanzas",
    country: "Cuba",
    category: "beach",
    sourceName: "WorldCamera Cuba",
    officialUrl: "https://worldcamera.net/en/webcams/caribic/cuba",
    sourcePageUrl: "https://worldcamera.net/en/webcams/caribic/cuba",
    lat: 23.1799,
    lng: -81.1885,
    sourceOnly: true,
  },
  {
    id: "cu-havana-cruising-earth",
    name: "Havana Port Camera Listing",
    area: "Havana",
    region: "La Habana",
    county: "Havana",
    country: "Cuba",
    category: "harbor",
    sourceName: "Cruising Earth Port Cameras",
    officialUrl: "https://www.cruisingearth.com/port-webcams/caribbean/havana-cuba/",
    sourcePageUrl: "https://www.cruisingearth.com/port-webcams/caribbean/havana-cuba/",
    lat: 23.1377,
    lng: -82.3476,
    sourceOnly: true,
  },
  {
    id: "pa-panama-canal-miraflores",
    name: "Panama Canal Miraflores Locks",
    area: "Miraflores Locks",
    region: "Panama Canal",
    county: "Panama",
    country: "Panama",
    category: "harbor",
    sourceName: "Panama Canal Authority Webcams",
    officialUrl: "https://multimedia.panama-canal.com/Webcams/miraflores.html",
    sourcePageUrl: "https://multimedia.panama-canal.com/Webcams/miraflores.html",
    imageUrl: "http://webcams.delcanal.com/hd-miraflores.jpg",
    lat: 8.9967,
    lng: -79.5908,
  },
  {
    id: "pa-panama-canal-gatun",
    name: "Panama Canal Gatun Locks",
    area: "Gatun Locks",
    region: "Panama Canal",
    county: "Colon",
    country: "Panama",
    category: "harbor",
    sourceName: "Panama Canal Authority Webcams",
    officialUrl: "https://multimedia.panama-canal.com/Webcams/gatun.html",
    sourcePageUrl: "https://multimedia.panama-canal.com/Webcams/gatun.html",
    imageUrl: "http://webcams.delcanal.com/gatun00009.jpg",
    lat: 9.2728,
    lng: -79.9203,
  },
  {
    id: "pa-panama-canal-agua-clara",
    name: "Panama Canal Agua Clara Locks",
    area: "Agua Clara Locks",
    region: "Panama Canal",
    county: "Colon",
    country: "Panama",
    category: "harbor",
    sourceName: "Panama Canal Authority Webcams",
    officialUrl: "https://multimedia.panama-canal.com/Webcams/aguaclara.html",
    sourcePageUrl: "https://multimedia.panama-canal.com/Webcams/aguaclara.html",
    imageUrl: "http://webcams.delcanal.com/aguaclara00001.jpg",
    lat: 9.3027,
    lng: -79.9127,
  },
  {
    id: "pa-panama-canal-cocoli",
    name: "Panama Canal Cocoli Locks",
    area: "Cocoli Locks",
    region: "Panama Canal",
    county: "Panama",
    country: "Panama",
    category: "harbor",
    sourceName: "Panama Canal Authority Webcams",
    officialUrl: "https://multimedia.panama-canal.com/Webcams/cocoli.html",
    sourcePageUrl: "https://multimedia.panama-canal.com/Webcams/cocoli.html",
    imageUrl: "http://webcams.delcanal.com/cocoli00001.jpg",
    lat: 8.9759,
    lng: -79.5904,
  },
  {
    id: "us-al-algo-cameras",
    name: "ALGO Traffic Camera Portal",
    area: "Alabama",
    region: "Alabama",
    county: "Statewide",
    country: "United States",
    category: "traffic",
    sourceName: "ALGO Traffic Cameras",
    officialUrl: "https://algotraffic.com/Cameras",
    sourcePageUrl: "https://algotraffic.com/Cameras",
    lat: 32.8067,
    lng: -86.7911,
    sourceOnly: true,
  },
  {
    id: "us-ar-idrive-cameras",
    name: "IDrive Arkansas Camera Portal",
    area: "Arkansas",
    region: "Arkansas",
    county: "Statewide",
    country: "United States",
    category: "traffic",
    sourceName: "IDrive Arkansas",
    officialUrl: "https://idrivearkansas.com/",
    sourcePageUrl: "https://idrivearkansas.com/",
    lat: 34.9697,
    lng: -92.3731,
    sourceOnly: true,
  },
  {
    id: "us-tn-smartway-cameras",
    name: "TDOT SmartWay Camera Portal",
    area: "Tennessee",
    region: "Tennessee",
    county: "Statewide",
    country: "United States",
    category: "traffic",
    sourceName: "TDOT SmartWay Cameras",
    officialUrl: "https://smartway.tn.gov/allcams",
    sourcePageUrl: "https://smartway.tn.gov/allcams",
    lat: 35.7478,
    lng: -86.6923,
    sourceOnly: true,
  },
  {
    id: "us-ok-oktraffic-cameras",
    name: "OKTraffic Camera Portal",
    area: "Oklahoma",
    region: "Oklahoma",
    county: "Statewide",
    country: "United States",
    category: "traffic",
    sourceName: "OKTraffic / ODOT Hub",
    officialUrl: "https://spotlight-okdot.hub.arcgis.com/",
    sourcePageUrl: "https://spotlight-okdot.hub.arcgis.com/",
    lat: 35.5653,
    lng: -96.9289,
    sourceOnly: true,
  },
];

const SCOPE_BOUNDS = {
  world: { label: "Global", lamin: -70, lamax: 82, lomin: -180, lomax: 180, limit: 1800, flightLimit: 5000, satelliteLimit: 5000, quakeLimit: 2000, fireLimit: 3000 },
  us: { label: "United States", lamin: 18.0, lamax: 72.5, lomin: -170.0, lomax: -52.0, limit: 1400, flightLimit: 2200, satelliteLimit: 2500, quakeLimit: 1500, fireLimit: 2200 },
  west: { label: "US West", lamin: 31.0, lamax: 49.8, lomin: -125.6, lomax: -102.0, limit: 900, flightLimit: 900, satelliteLimit: 1400, quakeLimit: 900, fireLimit: 1200 },
  oregon: { label: "Oregon", lamin: 41.8, lamax: 46.4, lomin: -124.9, lomax: -116.3, limit: 320, flightLimit: 420, satelliteLimit: 700, quakeLimit: 500, fireLimit: 700 },
};

const CENSUS_STATE_CENTROIDS = {
  "01": { code: "AL", lat: 32.8067, lng: -86.7911 },
  "02": { code: "AK", lat: 61.3707, lng: -152.4044 },
  "04": { code: "AZ", lat: 33.7298, lng: -111.4312 },
  "05": { code: "AR", lat: 34.9697, lng: -92.3731 },
  "06": { code: "CA", lat: 36.1162, lng: -119.6816 },
  "08": { code: "CO", lat: 39.0598, lng: -105.3111 },
  "09": { code: "CT", lat: 41.5978, lng: -72.7554 },
  "10": { code: "DE", lat: 39.3185, lng: -75.5071 },
  "11": { code: "DC", lat: 38.8974, lng: -77.0268 },
  "12": { code: "FL", lat: 27.7663, lng: -81.6868 },
  "13": { code: "GA", lat: 33.0406, lng: -83.6431 },
  "15": { code: "HI", lat: 21.0943, lng: -157.4983 },
  "16": { code: "ID", lat: 44.2405, lng: -114.4788 },
  "17": { code: "IL", lat: 40.3495, lng: -88.9861 },
  "18": { code: "IN", lat: 39.8494, lng: -86.2583 },
  "19": { code: "IA", lat: 42.0115, lng: -93.2105 },
  "20": { code: "KS", lat: 38.5266, lng: -96.7265 },
  "21": { code: "KY", lat: 37.6681, lng: -84.6701 },
  "22": { code: "LA", lat: 31.1695, lng: -91.8678 },
  "23": { code: "ME", lat: 44.6939, lng: -69.3819 },
  "24": { code: "MD", lat: 39.0639, lng: -76.8021 },
  "25": { code: "MA", lat: 42.2302, lng: -71.5301 },
  "26": { code: "MI", lat: 43.3266, lng: -84.5361 },
  "27": { code: "MN", lat: 45.6945, lng: -93.9002 },
  "28": { code: "MS", lat: 32.7416, lng: -89.6787 },
  "29": { code: "MO", lat: 38.4561, lng: -92.2884 },
  "30": { code: "MT", lat: 46.9219, lng: -110.4544 },
  "31": { code: "NE", lat: 41.1254, lng: -98.2681 },
  "32": { code: "NV", lat: 38.3135, lng: -117.0554 },
  "33": { code: "NH", lat: 43.4525, lng: -71.5639 },
  "34": { code: "NJ", lat: 40.2989, lng: -74.521 },
  "35": { code: "NM", lat: 34.8405, lng: -106.2485 },
  "36": { code: "NY", lat: 42.1657, lng: -74.9481 },
  "37": { code: "NC", lat: 35.6301, lng: -79.8064 },
  "38": { code: "ND", lat: 47.5289, lng: -99.784 },
  "39": { code: "OH", lat: 40.3888, lng: -82.7649 },
  "40": { code: "OK", lat: 35.5653, lng: -96.9289 },
  "41": { code: "OR", lat: 44.572, lng: -122.0709 },
  "42": { code: "PA", lat: 40.5908, lng: -77.2098 },
  "44": { code: "RI", lat: 41.6809, lng: -71.5118 },
  "45": { code: "SC", lat: 33.8569, lng: -80.945 },
  "46": { code: "SD", lat: 44.2998, lng: -99.4388 },
  "47": { code: "TN", lat: 35.7478, lng: -86.6923 },
  "48": { code: "TX", lat: 31.0545, lng: -97.5635 },
  "49": { code: "UT", lat: 40.1500, lng: -111.8624 },
  "50": { code: "VT", lat: 44.0459, lng: -72.7107 },
  "51": { code: "VA", lat: 37.7693, lng: -78.17 },
  "53": { code: "WA", lat: 47.4009, lng: -121.4905 },
  "54": { code: "WV", lat: 38.4912, lng: -80.9545 },
  "55": { code: "WI", lat: 44.2685, lng: -89.6165 },
  "56": { code: "WY", lat: 42.756, lng: -107.3025 },
  "72": { code: "PR", lat: 18.2208, lng: -66.5901 },
};

const CALTRANS_DISTRICTS = Array.from({ length: 12 }, (_, index) => index + 1);
const DYNAMIC_CAMERAS_BY_ID = new Map();
const CELESTRAK_FALLBACK_GROUPS = ["visual", "stations", "starlink", "gps-ops", "gnss", "geo", "weather", "resource"];

const ARCGIS_CAMERA_SOURCES = [
  {
    id: "penndot",
    name: "PennDOT Traffic Cameras",
    url: "https://gis.penndot.gov/arcgis/rest/services/paprojects/paprojects/MapServer/14/query",
    country: "United States",
    region: "Pennsylvania",
    category: "traffic",
    nameFields: ["LOCATION_DESC", "STATEWIDE_ID"],
    areaFields: ["LOCATION_DESC"],
    imageFields: ["URL"],
    sourceOnly: true,
    refreshSeconds: 60,
    officialUrl: "https://www.511pa.com/",
    tags: ["pennsylvania", "penndot", "511pa", "traffic", "dot"],
  },
  {
    id: "drivebc",
    name: "DriveBC Highway Cameras",
    url: "https://services.arcgis.com/zmLUiqh7X11gGV2d/ArcGIS/rest/services/Drive_BC_Web_Cameras/FeatureServer/0/query",
    country: "Canada",
    region: "British Columbia",
    category: "traffic",
    nameFields: ["camName", "orientation"],
    areaFields: ["highway_locationDescription", "highway_number"],
    imageFields: ["links_imageDisplay"],
    sourcePageFields: ["links_bchighwaycam"],
    useGeometryCoordinates: true,
    refreshSeconds: 900,
    officialUrl: "https://drivebc.ca/",
    tags: ["british-columbia", "drivebc", "canada", "traffic"],
  },
  {
    id: "txdot-windy",
    name: "Texas TxDOT / Windy Cameras",
    url: "https://services7.arcgis.com/bF49JeI2xZRhCsD9/arcgis/rest/services/TxDoT_Cameras/FeatureServer/0/query",
    where: "url IS NOT NULL AND url <> '' AND status = 'Active'",
    country: "United States",
    region: "Texas",
    category: "traffic",
    nameFields: ["Equipment_Name", "Direction"],
    areaFields: ["city", "county", "District_Name"],
    imageFields: ["url"],
    useGeometryCoordinates: true,
    refreshSeconds: 180,
    officialUrl: "https://drivetexas.org/",
    tags: ["texas", "txdot", "windy", "traffic"],
  },
  {
    id: "oregon-tripcheck",
    name: "Oregon TripCheck Cameras",
    url: "https://services.arcgis.com/uUvqNMGPm7axC2dD/arcgis/rest/services/TripCheck_Cameras/FeatureServer/0/query",
    country: "United States",
    region: "Oregon",
    category: "traffic",
    nameFields: ["attributes_title", "attributes_route"],
    areaFields: ["attributes_route"],
    imageFields: ["attributes_filename"],
    refreshSeconds: 180,
    officialUrl: "https://tripcheck.com/",
    tags: ["oregon", "tripcheck", "odot", "traffic"],
  },
  {
    id: "illinois-travel-midwest",
    name: "Illinois Gateway / Travel Midwest Cameras",
    url: "https://services2.arcgis.com/aIrBD8yn1TDTEXoz/arcgis/rest/services/TrafficCamerasTM_Public/FeatureServer/0/query",
    country: "United States",
    region: "Illinois",
    category: "traffic",
    nameFields: ["CameraLocation", "CameraDirection"],
    areaFields: ["CameraLocation"],
    imageFields: ["SnapShot"],
    sourcePageFields: ["ImgPath"],
    disabledStatusFields: ["TooOld"],
    disabledStatusValues: ["true"],
    refreshSeconds: 60,
    officialUrl: "https://travelmidwest.com/",
    tags: ["illinois", "travel-midwest", "traffic", "dot"],
  },
  {
    id: "seattle-sdot",
    name: "Seattle SDOT Traffic Cameras",
    url: "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Traffic_Cameras_CDL/FeatureServer/0/query",
    country: "United States",
    region: "Washington",
    category: "traffic",
    nameFields: ["LOCATION", "NAME"],
    areaFields: ["OWNERSHIP", "DISTRICT"],
    imageFields: ["URL"],
    requiredStatus: { field: "SERVSTAT", values: ["ACTV"] },
    refreshSeconds: 60,
    officialUrl: "https://www.seattle.gov/transportation/",
    tags: ["seattle", "sdot", "washington", "traffic"],
  },
  {
    id: "king-wsdot",
    name: "King County / WSDOT Cameras",
    url: "https://services.arcgis.com/Ej0PsM5Aw677QF1W/arcgis/rest/services/TRAFFICCAMERA_POINT_2029/FeatureServer/0/query",
    country: "United States",
    region: "Washington",
    category: "traffic",
    nameFields: ["Location", "Description"],
    areaFields: ["CamRegion", "Owner", "Jurisdiction"],
    imageFields: ["ImageURL"],
    disabledStatusFields: ["CurrentStatus"],
    disabledStatusValues: ["retired", "inactive", "disabled"],
    refreshSeconds: 180,
    officialUrl: "https://kingcounty.gov/",
    tags: ["king-county", "wsdot", "washington", "traffic", "ferry"],
  },
  {
    id: "maryland-chart",
    name: "Maryland CHART Traffic Cameras",
    url: "https://chartimap1.sha.maryland.gov/arcgis/rest/services/CHART/Cameras/MapServer/0/query",
    country: "United States",
    region: "Maryland",
    category: "traffic",
    nameFields: ["location"],
    areaFields: ["location"],
    streamFields: ["hlsurl"],
    trustHls: true,
    refreshSeconds: 60,
    officialUrl: "https://chart.maryland.gov/",
    tags: ["maryland", "mdot", "chart", "traffic", "hls"],
  },
  {
    id: "ireland-tii",
    name: "Ireland TII Traffic Cameras",
    url: "https://services2.arcgis.com/WRtfelnPg3R7bCEW/arcgis/rest/services/TrafficCameras/FeatureServer/0/query",
    country: "Ireland",
    region: "Ireland",
    category: "traffic",
    nameFields: ["Name"],
    imageFields: ["WeatherCAM", "link"],
    refreshSeconds: 300,
    tags: ["ireland", "tii", "traffic", "weather"],
  },
  {
    id: "toronto-rescu",
    name: "Toronto Traffic Cameras",
    url: "https://services7.arcgis.com/mbC97TSabuNgCnce/arcgis/rest/services/TrafficCameras/FeatureServer/0/query",
    country: "Canada",
    region: "Toronto",
    category: "traffic",
    nameFields: ["Main_Road", "Cross_Street"],
    areaFields: ["Group_"],
    imageFields: ["Traffic_Image"],
    refreshSeconds: 120,
    tags: ["toronto", "canada", "traffic"],
  },
  {
    id: "fl511",
    name: "Florida 511 Traffic Cameras",
    url: "https://services.arcgis.com/3wFbqsFPLeKqOlIK/arcgis/rest/services/FL511_Traffic_Cameras/FeatureServer/0/query",
    country: "United States",
    region: "Florida",
    category: "traffic",
    nameFields: ["DESCRIPT"],
    areaFields: ["COUNTY"],
    imageFields: ["IMAGE"],
    refreshSeconds: 180,
    tags: ["florida", "511", "traffic"],
  },
  {
    id: "gdot",
    name: "Georgia DOT Traffic Cameras",
    url: "https://services1.arcgis.com/2iUE8l8JKrP2tygQ/ArcGIS/rest/services/GDOT_Live_Traffic_Cameras/FeatureServer/0/query",
    country: "United States",
    region: "Georgia",
    category: "traffic",
    nameFields: ["location_description", "name"],
    areaFields: ["county", "subdivision"],
    imageFields: ["url"],
    streamFields: ["HLS"],
    refreshSeconds: 120,
    tags: ["georgia", "gdot", "traffic"],
  },
  {
    id: "indiana-trafficwise",
    name: "KYTC / Indiana TrafficWise Cameras",
    url: "https://services2.arcgis.com/CcI36Pduqd0OR4W9/arcgis/rest/services/trafficCamerasCur_Prd/FeatureServer/0/query",
    country: "United States",
    region: "Kentucky / Indiana",
    category: "traffic",
    nameFields: ["description", "name"],
    areaFields: ["county", "district"],
    imageFields: ["snapshot"],
    refreshSeconds: 180,
    tags: ["kentucky", "indiana", "trafficwise", "kytc", "traffic"],
  },
  {
    id: "iowa-dot",
    name: "Iowa DOT Traffic Cameras",
    url: "https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/Traffic_Cameras_View/FeatureServer/0/query",
    country: "United States",
    region: "Iowa",
    category: "traffic",
    nameFields: ["Desc_", "ImageName"],
    areaFields: ["REGION", "Route"],
    imageFields: ["ImageURL"],
    streamFields: ["VideoURL", "VideoURL_HD", "VideoURL_HB"],
    trustHls: true,
    refreshSeconds: 60,
    tags: ["iowa", "iowa-dot", "traffic", "hls"],
  },
  {
    id: "redmond-wa",
    name: "Redmond Traffic Cameras",
    url: "https://gis.redmond.gov/arcgis/rest/services/Traffic/Cameras/MapServer/0/query",
    country: "United States",
    region: "Washington",
    category: "traffic",
    nameFields: ["Description"],
    areaFields: ["d_Jurisdiction"],
    imageFields: ["ImagePath"],
    refreshSeconds: 180,
    tags: ["redmond", "washington", "traffic"],
  },
  {
    id: "lawrence-ks",
    name: "Lawrence Traffic Cameras",
    url: "https://services.arcgis.com/8O9UlSTnqjKptoda/ArcGIS/rest/services/Traffic_Cameras/FeatureServer/4/query",
    country: "United States",
    region: "Kansas",
    category: "traffic",
    nameFields: ["Approach", "FacilityID"],
    areaFields: ["OwnedBy"],
    imageFields: ["Hyperlink"],
    refreshSeconds: 300,
    tags: ["lawrence", "kansas", "traffic"],
  },
];

const KNOWN_LIVE_PLAYER_VIEWS = {
  "osu-memorial-union": {
    type: "iframe",
    url: "https://camstreamer.com/embed/3437433269aa0f7/S-61681?rel=0",
    sourceLabel: "CamStreamer live player",
    sourcePageUrl: "https://camstreamer.com/live/stream/167275607-oregon-state-university-memorial-union",
    capability: "player",
  },
  "osu-library-quad": {
    type: "iframe",
    url: "https://camstreamer.com/embed/erpJktO6XPgNoYqhfEYN53t2lNaW6iCxoNXSbbrJ?rel=0",
    sourceLabel: "CamStreamer live player",
    sourcePageUrl: "https://camstreamer.com/live/stream/376439953-oregon-state-university-valley",
    capability: "player",
  },
  "osu-bend-bruckner": {
    type: "iframe",
    url: "https://camstreamer.com/embed/084zuf2CdXTMyqMAk1QoVQMF6yLp8qUsUCTG8sLt?rel=0",
    sourceLabel: "CamStreamer live player",
    sourcePageUrl: "https://camstreamer.com/live/stream/43269-oregon-state-university-cascades",
    capability: "player",
  },
  "osu-yaquina-bay": {
    type: "iframe",
    url: "https://camstreamer.com/embed/w0ll7Jk2OKKasd25kSl9XnTtVKtkhU2WonTn82Sq?rel=0",
    sourceLabel: "CamStreamer live player",
    sourcePageUrl: "https://camstreamer.com/live/stream/113409317-oregon-state-university-newport",
    capability: "player",
  },
  "osu-monroe": {
    type: "iframe",
    url: "https://www.youtube-nocookie.com/embed/Z5skON2yzcI?autoplay=1&mute=1&playsinline=1&rel=0",
    sourceLabel: "YouTube live player",
    sourcePageUrl: "https://www.youtube.com/watch?v=Z5skON2yzcI",
    capability: "player",
  },
};

const FALLBACK_STILL_URLS = {
  "osu-memorial-union": "https://webcam.oregonstate.edu/cam/mu/live/live.jpg",
  "osu-monroe": "https://webcam.oregonstate.edu/cam/monroe/live/live.jpg",
  "osu-library-quad": "https://webcam.oregonstate.edu/cam/libraryquad/live/live.jpg",
  "osu-bend-bruckner": "https://webcam.oregonstate.edu/cam/cascades3/live/live.jpg",
  "osu-bend-innovation": "https://webcam.oregonstate.edu/cam/cascades1/live/live.jpg",
  "osu-yaquina-bay": "https://webcam.oregonstate.edu/cam/yaquinabay/live/live.jpg",
  "osu-ship-ops": "https://webcam.oregonstate.edu/cam/ships/live/live.jpg",
};

const cache = new Map();
let serverPort = REQUESTED_PORT;

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);

    if (requestUrl.pathname === "/api/health") {
      return sendJson(response, 200, { ok: true, version: APP_VERSION, port: serverPort, generatedAt: new Date().toISOString() });
    }

    if (requestUrl.pathname === "/api/cameras") {
      const scope = normalizeScope(requestUrl.searchParams.get("scope"));
      const cameraSet = await buildCameraSet(scope);
      return sendJson(response, 200, { generatedAt: new Date().toISOString(), scope, cameras: cameraSet.data, sourceHealth: cameraSet.health });
    }

    if (requestUrl.pathname === "/api/settings") {
      if (request.method === "GET") return sendJson(response, 200, publicSettings());
      if (request.method === "POST") {
        if (!isSameOriginLocalRequest(request)) {
          return sendJson(response, 403, { error: "Forbidden origin" });
        }
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          return sendJson(response, 415, { error: "Content-Type must be application/json" });
        }
        const payload = await readJsonBody(request);
        return sendJson(response, 200, updateLocalSettings(payload));
      }
      return sendJson(response, 405, { error: "Method not allowed" });
    }

    if (requestUrl.pathname === "/api/intel-snapshot") {
      const scope = normalizeScope(requestUrl.searchParams.get("scope"));
      const data = await buildIntelSnapshot(scope);
      return sendJson(response, 200, data);
    }

    if (requestUrl.pathname === "/api/feed-view") {
      const feedId = requestUrl.searchParams.get("id");
      if (!feedId) return sendJson(response, 400, { error: "Missing feed id" });
      return sendJson(response, 200, await resolveFeedView(feedId));
    }

    if (requestUrl.pathname === "/api/demo-feeds") {
      const scope = normalizeScope(requestUrl.searchParams.get("scope"));
      return sendJson(response, 200, await buildDemoFeeds(scope));
    }

    if (requestUrl.pathname === "/api/globe-texture") {
      return proxyGibsTexture(requestUrl, response);
    }

    if (requestUrl.pathname === "/api/image-proxy") {
      return proxyImage(requestUrl.searchParams.get("url"), response);
    }

    return serveStatic(requestUrl.pathname, response);
  } catch (error) {
    return sendJson(response, 500, { error: "Internal server error", message: error.message });
  }
});

listenOnPreferredPort(0);

async function buildIntelSnapshot(scope) {
  const bounds = SCOPE_BOUNDS[scope];
  const [cameraSet, satelliteResult, flightResult, quakeResult, alertResult, nhcResult, cubaReportResult, fireResult, egpIncidentResult, egpPerimeterResult, censusResult] = await Promise.all([
    buildCameraSet(scope),
    getCached("satellites", 10 * 60 * 1000, () => fetchSatellites(scope)),
    getCached(`flights:${scope}`, 10 * 60 * 1000, () => fetchFlights(scope)),
    getCached("quakes", 60 * 1000, () => fetchQuakes()),
    getCached(`alerts:${scope}`, 90 * 1000, () => fetchAlerts(scope)),
    getCached("nhc:current-storms", 10 * 60 * 1000, () => fetchNhcStormAlerts()),
    getCached("gdelt:cuba-reports", 15 * 60 * 1000, () => fetchCubaOpenReports()),
    getCached(`fires:${scope}`, 5 * 60 * 1000, () => fetchFires(scope)),
    getCached("egp:incidents", 5 * 60 * 1000, () => fetchEgpIncidents()),
    getCached("egp:perimeters", 10 * 60 * 1000, () => fetchEgpPerimeters()),
    getCached("census:state-population", 24 * 60 * 60 * 1000, () => fetchCensusDemographics()),
  ]);

  const cameras = cameraSet.data;
  const satellites = filterGeoItems(satelliteResult.data, bounds).slice(0, bounds.satelliteLimit || bounds.limit);
  const flights = filterGeoItems(flightResult.data, bounds).slice(0, bounds.flightLimit || bounds.limit);
  const quakes = filterGeoItems(quakeResult.data, bounds).slice(0, bounds.quakeLimit || bounds.limit);
  const cubaReferenceSignals = buildCubaReferenceSignals();
  const nwsAlerts = filterGeoItems(alertResult.data || [], bounds);
  const nhcAlerts = filterGeoItems(nhcResult.data || [], bounds);
  const cubaReportAlerts = filterGeoItems(cubaReportResult.data || [], bounds);
  const referenceAlerts = filterGeoItems(cubaReferenceSignals, bounds);
  const alerts = sortAlertsForDisplay([...nwsAlerts, ...nhcAlerts, ...cubaReportAlerts, ...referenceAlerts]).slice(0, 100);
  const fires = filterGeoItems([...(fireResult.data || []), ...(egpIncidentResult.data || []), ...(egpPerimeterResult.data || [])], bounds).slice(0, bounds.fireLimit || 1800);
  const demographics = filterGeoItems(censusResult.data || [], bounds).slice(0, 80);
  const events = buildEvents({ cameras, satellites, flights, quakes, alerts, fires });
  const regions = buildRegions({ cameras, satellites, flights, quakes, alerts, fires });
  const severity = buildSeverity({ alerts, quakes, fires });
  const sourceHealth = [
    ...cameraSet.health,
    healthFromResult("CelesTrak GP", satelliteResult, satellites.length),
    healthFromResult("Aircraft states", flightResult, flights.length),
    healthFromResult("USGS quakes", quakeResult, quakes.length),
    healthFromResult("NWS alerts", alertResult, nwsAlerts.length),
    healthFromResult("NHC active storms", nhcResult, nhcAlerts.length),
    healthFromResult("Cuba open reporting", cubaReportResult, cubaReportAlerts.length, { optional: true }),
    { name: "Cuba reference monitors", ok: true, count: referenceAlerts.length, cached: false, stale: false, message: "" },
    healthFromResult("NASA FIRMS fires", fireResult, filterGeoItems(fireResult.data || [], bounds).length),
    healthFromResult("EGP WildFireSA incidents", egpIncidentResult, filterGeoItems(egpIncidentResult.data || [], bounds).length),
    healthFromResult("WFIGS current perimeters", egpPerimeterResult, filterGeoItems(egpPerimeterResult.data || [], bounds).length),
    healthFromResult("Census ACS population", censusResult, demographics.length),
  ];
  const videoFeeds = cameras.filter((camera) => camera.capability === "player" || camera.capability === "stream").length;

  return {
    generatedAt: new Date().toISOString(),
    scope,
    cameraCatalogTotal: cameras.length,
    cameras,
    satellites,
    flights,
    quakes,
    alerts,
    fires,
    demographics,
    traffic: [],
    events,
    regions,
    severity,
    sourceHealth,
    metrics: {
      eventsToday: cameras.length + satellites.length + flights.length + quakes.length + alerts.length + fires.length + demographics.length,
      alerts: alerts.length,
      assets: cameras.length + satellites.length + flights.length + fires.length,
      fires: fires.length,
      demographics: demographics.length,
      cameraFeeds: cameras.length,
      videoFeeds,
      streams: sourceHealth.filter((source) => source.ok).length,
    },
  };
}

async function buildCameraSet(scope = "world") {
  const bounds = SCOPE_BOUNDS[scope] || SCOPE_BOUNDS.world;
  const localCameras = await buildLocalCameras();
  const adapterSpecs = cameraAdapterSpecs(scope);
  const adapterResults = await Promise.all(
    adapterSpecs.map((adapter) => getCached(adapter.key, adapter.ttlMs, adapter.fetcher))
  );
  const externalCameras = adapterResults.flatMap((result) => result.data || []);
  const sourceHealth = [
    { name: "Local public camera catalog", ok: true, count: filterGeoItems(localCameras, bounds).length, source: "local" },
    ...adapterSpecs.map((adapter, index) => healthFromResult(adapter.name, adapterResults[index], filterGeoItems(adapterResults[index].data || [], bounds).length)),
  ];

  const cameras = [...localCameras, ...externalCameras]
    .filter((camera) => Number.isFinite(camera.lat) && Number.isFinite(camera.lng))
    .filter((camera) => !bounds || bounds === SCOPE_BOUNDS.world || inBounds(camera, bounds))
    .sort(compareCameras);

  rememberDynamicCameras(cameras);
  return { data: cameras, health: sourceHealth };
}

async function buildLocalCameras() {
  const cameras = await Promise.all(
    DATA.feeds.map(async (feed) => {
      const meta = META[feed.id] || {};
      const source = SOURCES_BY_ID.get(feed.sourceId) || {};
      const viewer = await resolveCatalogViewer(feed, meta);
      return {
        id: feed.id,
        type: "camera",
        name: feed.name,
        shortName: shortCameraName(feed.name),
        area: feed.area,
        region: feed.region,
        county: feed.county,
        category: feed.category,
        media: feed.media,
        status: feed.status,
        freshness: feed.freshness,
        tags: feed.tags || [],
        sourceId: feed.sourceId,
        sourceName: source.name || feed.sourceId,
        sourceUrl: source.url || feed.url,
        officialUrl: feed.url,
        sourcePageUrl: viewer.sourcePageUrl || source.url || feed.url,
        lat: Number(meta.lat),
        lng: Number(meta.lng),
        viewerType: viewer.type,
        capability: viewer.capability,
        capabilityLabel: capabilityLabel(viewer.capability),
        previewUrl: viewer.previewUrl || "",
        imageUrl: viewer.imageUrl || "",
      };
    })
  );
  return [...cameras, ...CURATED_PUBLIC_CAMERAS.map(mapCuratedCamera)]
    .filter((camera) => Number.isFinite(camera.lat) && Number.isFinite(camera.lng));
}

async function buildDemoFeeds(scope = "world") {
  const bounds = SCOPE_BOUNDS[scope] || SCOPE_BOUNDS.world;
  const [localCameras, cameraSet] = await Promise.all([
    buildLocalCameras(),
    buildCameraSet(scope),
  ]);
  const localById = new Map(localCameras.map((camera) => [camera.id, camera]));
  const knownFeeds = (await Promise.all(Object.keys(KNOWN_LIVE_PLAYER_VIEWS)
    .map(async (feedId) => {
      const camera = localById.get(feedId);
      const feed = FEEDS_BY_ID.get(feedId);
      if (!camera || !feed) return null;
      if (bounds && bounds !== SCOPE_BOUNDS.world && !inBounds(camera, bounds)) return null;
      const view = await resolveKnownPlayerView(feed, META[feedId] || {});
      if (!isDemoPlayableView(view)) return null;
      return makeDemoFeedEntry(camera, {
        feedId,
        generatedAt: new Date().toISOString(),
        officialUrl: feed.url,
        note: "Pre-vetted public embedded player used for demo mode.",
        ...view,
        capability: "player",
      }, "curated-player");
    }))).filter(Boolean);

  const knownIds = new Set(knownFeeds.map((entry) => entry.camera.id));
  const candidates = selectDiverseDemoCandidates(
    cameraSet.data.filter((camera) => !knownIds.has(camera.id)),
    84
  );
  const dynamicFeeds = (await mapLimit(candidates, 8, async (camera) => {
    try {
      const view = await resolveFeedView(camera.id);
      if (!isDemoPlayableView(view)) return null;
      return makeDemoFeedEntry(camera, {
        ...view,
        generatedAt: new Date().toISOString(),
        note: view.note || "Validated browser-playable public video selected for demo mode.",
      }, "validated-catalog");
    } catch {
      return null;
    }
  })).filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    scope,
    feeds: distributeDemoFeeds([...knownFeeds, ...dynamicFeeds], 32),
  };
}

function makeDemoFeedEntry(camera, view, demoSource) {
  return {
    bucket: demoGeoBucket(camera),
    demoSource,
    camera: {
      ...camera,
      capability: "player",
      capabilityLabel: view.type === "hls" ? "Live Stream" : view.type === "video" ? "Public Video" : "Live Player",
    },
    view: {
      ...view,
      capability: view.type === "iframe" ? "player" : view.capability || "player",
    },
  };
}

function isDemoPlayableView(view) {
  if (!view || view.streamStatus === "down" || view.offlineReason) return false;
  if (view.type === "video" || view.type === "hls") return Boolean(view.url);
  if (view.type !== "iframe") return false;
  if (view.capability !== "player") return false;
  return Boolean(view.url);
}

function selectDiverseDemoCandidates(cameras, limit = 84) {
  const byBucket = new Map();
  const sourceCounts = new Map();
  const eligible = uniqueCamerasById(cameras)
    .filter(isDemoStreamCandidate)
    .sort(compareDemoCandidates);

  for (const camera of eligible) {
    const bucket = demoGeoBucket(camera);
    const sourceKey = `${bucket}:${camera.sourceName || camera.sourceId || "unknown"}`;
    const bucketItems = byBucket.get(bucket) || [];
    if (bucketItems.length >= 14) continue;
    if ((sourceCounts.get(sourceKey) || 0) >= 5) continue;
    bucketItems.push(camera);
    byBucket.set(bucket, bucketItems);
    sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) || 0) + 1);
  }

  return roundRobinBuckets(byBucket, [
    "US West",
    "US Mountain",
    "US Central",
    "US East",
    "Canada",
    "United Kingdom",
    "Europe",
    "Asia Pacific",
    "Latin America",
    "Global",
  ], limit);
}

function isDemoStreamCandidate(camera) {
  if (!camera || !Number.isFinite(Number(camera.lat)) || !Number.isFinite(Number(camera.lng))) return false;
  if (!camera.streamUrl) return camera.capability === "player" && camera.viewerType === "iframe";
  if (camera.viewerType === "hls" || camera.viewerType === "video") return true;
  return /\.(?:m3u8|mp4|m4v|webm)(?:$|\?)/i.test(camera.streamUrl);
}

function compareDemoCandidates(left, right) {
  const rank = (camera) => {
    if (camera.viewerType === "hls" && camera.capability === "stream") return 0;
    if (camera.viewerType === "hls") return 1;
    if (camera.viewerType === "video") return 2;
    if (camera.capability === "player") return 3;
    return 4;
  };
  return rank(left) - rank(right) ||
    String(left.country || "").localeCompare(String(right.country || "")) ||
    String(left.region || "").localeCompare(String(right.region || "")) ||
    String(left.name || "").localeCompare(String(right.name || ""));
}

function distributeDemoFeeds(feeds, limit = 32) {
  const unique = uniqueDemoEntries(feeds);
  const byBucket = new Map();
  for (const entry of unique) {
    const bucket = entry.bucket || demoGeoBucket(entry.camera);
    const items = byBucket.get(bucket) || [];
    items.push(entry);
    byBucket.set(bucket, items);
  }
  return roundRobinBuckets(byBucket, [
    "US West",
    "US Mountain",
    "US Central",
    "US East",
    "Canada",
    "United Kingdom",
    "Europe",
    "Asia Pacific",
    "Latin America",
    "Global",
  ], limit);
}

function roundRobinBuckets(byBucket, preferredOrder, limit) {
  const buckets = [
    ...preferredOrder.filter((bucket) => byBucket.has(bucket)),
    ...[...byBucket.keys()].filter((bucket) => !preferredOrder.includes(bucket)).sort(),
  ];
  const output = [];
  for (let index = 0; output.length < limit; index += 1) {
    let added = false;
    for (const bucket of buckets) {
      const item = byBucket.get(bucket)?.[index];
      if (item) {
        output.push(item);
        added = true;
        if (output.length >= limit) break;
      }
    }
    if (!added) break;
  }
  return output;
}

function demoGeoBucket(camera) {
  const country = cleanCameraText(camera?.country || "");
  const region = cleanCameraText(camera?.region || "");
  const lat = Number(camera?.lat);
  const lng = Number(camera?.lng);
  const insideContinentalUs = Number.isFinite(lat) && Number.isFinite(lng) && lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66;
  const looksUnitedStates = /^united states$/i.test(country) || insideContinentalUs || /oregon|washington|california|idaho|nevada|arizona|colorado|minnesota|iowa|kansas|nebraska|north dakota|missouri|maryland|new york|alabama|arkansas/i.test(region);
  if (looksUnitedStates) {
    if (/california|oregon|washington|alaska|hawaii|nevada|arizona/i.test(region) || lng <= -112) return "US West";
    if (/colorado|idaho|montana|utah|wyoming|new mexico/i.test(region) || lng <= -102) return "US Mountain";
    if (/minnesota|iowa|kansas|nebraska|north dakota|south dakota|missouri|texas|oklahoma/i.test(region) || lng <= -88) return "US Central";
    return "US East";
  }
  if (/canada/i.test(country)) return "Canada";
  if (/united kingdom|england|scotland|wales|northern ireland/i.test(country)) return "United Kingdom";
  if (/spain|finland|germany|france|netherlands|belgium|italy|portugal|ireland|switzerland|austria|norway|sweden|denmark/i.test(country)) return "Europe";
  if (/hong kong|china|japan|south korea|singapore|australia|new zealand|taiwan|india|thailand|philippines|indonesia|malaysia/i.test(country)) return "Asia Pacific";
  if (/panama|cuba|mexico|brazil|argentina|chile|colombia|peru|caribbean/i.test(country)) return "Latin America";
  return country || "Global";
}

function uniqueCamerasById(cameras) {
  const seen = new Set();
  return (cameras || []).filter((camera) => {
    if (!camera?.id || seen.has(camera.id)) return false;
    seen.add(camera.id);
    return true;
  });
}

function uniqueDemoEntries(entries) {
  const seen = new Set();
  return (entries || []).filter((entry) => {
    const id = entry?.camera?.id || entry?.view?.feedId;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

function mapCuratedCamera(camera) {
  return {
    id: camera.id,
    dynamic: true,
    type: "camera",
    name: camera.name,
    shortName: shortCameraName(camera.name),
    area: camera.area,
    region: camera.region,
    county: camera.county,
    country: camera.country,
    category: camera.category || "city",
    media: "still",
    status: "Online",
    freshness: 2,
    tags: [camera.country, camera.region, camera.area, camera.category, "public webcam"].filter(Boolean),
    sourceId: `curated-${slugify(camera.sourceName)}`,
    sourceName: camera.sourceName,
    sourceUrl: camera.sourcePageUrl || camera.officialUrl,
    officialUrl: camera.officialUrl || camera.sourcePageUrl,
    sourcePageUrl: camera.sourcePageUrl || camera.officialUrl,
    lat: Number(camera.lat),
    lng: Number(camera.lng),
    viewerType: camera.sourceOnly ? "page" : "image",
    capability: camera.sourceOnly ? "page" : "snapshot",
    capabilityLabel: camera.sourceOnly ? "Source Page" : "Current Still",
    previewUrl: camera.imageUrl || "",
    imageUrl: camera.imageUrl || "",
    refreshSeconds: 120,
  };
}

function cameraAdapterSpecs(scope) {
  const adapters = [];
  if (scope === "world" || scope === "us") {
    adapters.push({
      key: "cameras:nyc-traffic",
      name: "NYC traffic cameras",
      ttlMs: 2 * 60 * 1000,
      fetcher: fetchNycTrafficCameras,
    });
    adapters.push({
      key: "cameras:minnesota-511",
      name: "Minnesota 511 Cameras",
      ttlMs: 2 * 60 * 1000,
      fetcher: () => fetchCarsProgramCameras({
        idPrefix: "mn511",
        sourceName: "Minnesota 511 Cameras",
        url: SOURCE_URLS.minnesota511Cameras,
        origin: "https://511mn.org",
        officialUrl: "https://511mn.org/",
        region: "Minnesota",
        tags: ["minnesota", "mn511", "mndot", "traffic"],
      }),
    });
    adapters.push({
      key: "cameras:colorado-cotrip",
      name: "Colorado COTRIP Cameras",
      ttlMs: 2 * 60 * 1000,
      fetcher: () => fetchCarsProgramCameras({
        idPrefix: "cotrip",
        sourceName: "Colorado COTRIP Cameras",
        url: SOURCE_URLS.coloradoCotripCameras,
        origin: "https://www.cotrip.org",
        officialUrl: "https://www.cotrip.org/",
        region: "Colorado",
        tags: ["colorado", "cotrip", "cdot", "traffic"],
      }),
    });
    adapters.push({
      key: "cameras:nebraska-511",
      name: "Nebraska 511 Cameras",
      ttlMs: 2 * 60 * 1000,
      fetcher: () => fetchCarsProgramCameras({
        idPrefix: "ne511",
        sourceName: "Nebraska 511 Cameras",
        url: SOURCE_URLS.nebraska511Cameras,
        origin: "https://new.511.nebraska.gov",
        officialUrl: "https://new.511.nebraska.gov/",
        region: "Nebraska",
        tags: ["nebraska", "ne511", "ndot", "traffic"],
      }),
    });
    adapters.push({
      key: "cameras:kansas-511",
      name: "Kansas 511 Cameras",
      ttlMs: 2 * 60 * 1000,
      fetcher: () => fetchCarsProgramCameras({
        idPrefix: "ks511",
        sourceName: "Kansas 511 Cameras",
        url: SOURCE_URLS.kansas511Cameras,
        origin: "https://www.kandrive.gov",
        officialUrl: "https://www.kandrive.gov/",
        region: "Kansas",
        tags: ["kansas", "kandrive", "ksdot", "traffic"],
      }),
    });
    adapters.push({
      key: "cameras:north-dakota-dot",
      name: "North Dakota DOT Cameras",
      ttlMs: 5 * 60 * 1000,
      fetcher: fetchNorthDakotaCameras,
    });
    adapters.push({
      key: "cameras:missouri-modot",
      name: "Missouri MoDOT Cameras",
      ttlMs: 2 * 60 * 1000,
      fetcher: fetchMissouriSnapshotCameras,
    });
    adapters.push({
      key: "cameras:arizona-511",
      name: "Arizona 511 Cameras",
      ttlMs: 2 * 60 * 1000,
      fetcher: fetchArizona511Cameras,
    });
    adapters.push({
      key: "cameras:austin-open-data",
      name: "Austin Traffic Cameras",
      ttlMs: 2 * 60 * 1000,
      fetcher: fetchAustinTrafficCameras,
    });
    const wisconsinKey = getConfiguredSecret("wisconsin511ApiKey", ["WISCONSIN_511_API_KEY", "WI511_API_KEY"]);
    if (wisconsinKey) {
      adapters.push({
        key: "cameras:wisconsin-511",
        name: "Wisconsin 511 Cameras",
        ttlMs: 10 * 60 * 1000,
        fetcher: () => fetchTravelIqCameras({
          idPrefix: "wi511",
          sourceName: "Wisconsin 511 Cameras",
          url: SOURCE_URLS.wisconsin511Cameras,
          key: wisconsinKey,
          officialUrl: "https://511wi.gov/",
          region: "Wisconsin",
          country: "United States",
          tags: ["wisconsin", "wi511", "wisconsin-dot", "traffic"],
        }),
      });
    }
    const louisianaKey = getConfiguredSecret("louisiana511ApiKey", ["LOUISIANA_511_API_KEY", "LA511_API_KEY"]);
    if (louisianaKey) {
      adapters.push({
        key: "cameras:louisiana-511",
        name: "Louisiana 511 Cameras",
        ttlMs: 10 * 60 * 1000,
        fetcher: () => fetchTravelIqCameras({
          idPrefix: "la511",
          sourceName: "Louisiana 511 Cameras",
          url: SOURCE_URLS.louisiana511Cameras,
          key: louisianaKey,
          officialUrl: "https://www.511la.org/",
          region: "Louisiana",
          country: "United States",
          tags: ["louisiana", "la511", "ladotd", "traffic"],
        }),
      });
    }
    const driveNcKey = getConfiguredSecret("driveNcApiKey", ["DRIVENC_API_KEY", "NC511_API_KEY"]);
    if (driveNcKey) {
      adapters.push({
        key: "cameras:drivenc",
        name: "DriveNC Cameras",
        ttlMs: 10 * 60 * 1000,
        fetcher: () => fetchTravelIqCameras({
          idPrefix: "drivenc",
          sourceName: "DriveNC Cameras",
          url: SOURCE_URLS.driveNcCameras,
          key: driveNcKey,
          officialUrl: "https://drivenc.gov/",
          region: "North Carolina",
          country: "United States",
          tags: ["north-carolina", "drivenc", "ncdot", "traffic"],
        }),
      });
    }
  }
  if (scope === "world") {
    adapters.push({
      key: "cameras:tfl-jamcams",
      name: "Transport for London JamCams",
      ttlMs: 2 * 60 * 1000,
      fetcher: fetchTflJamCams,
    });
    adapters.push({
      key: "cameras:ontario-511",
      name: "Ontario 511 Cameras",
      ttlMs: 2 * 60 * 1000,
      fetcher: () => fetchV2RoadCameras({
        idPrefix: "on511",
        sourceName: "Ontario 511 Cameras",
        url: SOURCE_URLS.ontario511Cameras,
        officialUrl: "https://511on.ca/",
        region: "Ontario",
        country: "Canada",
        tags: ["ontario", "511", "mto", "canada", "traffic"],
      }),
    });
    adapters.push({
      key: "cameras:alberta-511",
      name: "Alberta 511 Cameras",
      ttlMs: 2 * 60 * 1000,
      fetcher: () => fetchV2RoadCameras({
        idPrefix: "ab511",
        sourceName: "Alberta 511 Cameras",
        url: SOURCE_URLS.alberta511Cameras,
        officialUrl: "https://511.alberta.ca/",
        region: "Alberta",
        country: "Canada",
        tags: ["alberta", "511", "canada", "traffic"],
      }),
    });
    adapters.push({
      key: "cameras:fintraffic-weathercams",
      name: "Fintraffic Weather Cameras",
      ttlMs: 2 * 60 * 1000,
      fetcher: fetchFintrafficWeathercams,
    });
    adapters.push({
      key: "cameras:hong-kong-traffic",
      name: "Hong Kong Traffic Cameras",
      ttlMs: 2 * 60 * 1000,
      fetcher: fetchHongKongTrafficCameras,
    });
    adapters.push({
      key: "cameras:madrid-traffic",
      name: "Madrid Traffic Cameras",
      ttlMs: 5 * 60 * 1000,
      fetcher: fetchMadridTrafficCameras,
    });
    adapters.push({
      key: "cameras:spain-dgt",
      name: "Spain DGT Cameras",
      ttlMs: 60 * 60 * 1000,
      fetcher: fetchSpainDgtCameras,
    });
    adapters.push({
      key: "cameras:singapore-traffic-images",
      name: "Singapore Traffic Images",
      ttlMs: 90 * 1000,
      fetcher: fetchSingaporeTrafficImages,
    });
    adapters.push({
      key: "cameras:nzta-traffic",
      name: "NZTA Traffic Cameras",
      ttlMs: 5 * 60 * 1000,
      fetcher: fetchNztaTrafficCameras,
    });
    const nswKey = getConfiguredSecret("nswTransportApiKey", ["NSW_TRANSPORT_API_KEY", "TRANSPORT_NSW_API_KEY"]);
    if (nswKey) {
      adapters.push({
        key: "cameras:nsw-live-traffic",
        name: "NSW Live Traffic Cameras",
        ttlMs: 10 * 60 * 1000,
        fetcher: () => fetchNswTrafficCameras(nswKey),
      });
    }
  }
  if (scope === "world" || scope === "us" || scope === "west") {
    adapters.push({
      key: "cameras:caltrans",
      name: "Caltrans CCTV",
      ttlMs: 5 * 60 * 1000,
      fetcher: fetchCaltransCameras,
    });
  }
  for (const source of ARCGIS_CAMERA_SOURCES) {
    if (scope === "world" || (scope === "us" && source.country === "United States") || scope === "west") {
      adapters.push({
        key: `cameras:arcgis:${source.id}`,
        name: source.name,
        ttlMs: 5 * 60 * 1000,
        fetcher: () => fetchArcgisCameras(source),
      });
    }
  }
  return adapters;
}

function rememberDynamicCameras(cameras) {
  for (const camera of cameras) {
    if (camera.dynamic) DYNAMIC_CAMERAS_BY_ID.set(camera.id, camera);
  }
}

function compareCameras(left, right) {
  const rank = (camera) => {
    if (camera.capability === "stream") return 0;
    if (camera.capability === "player") return 1;
    if (camera.viewerType === "image") return 2;
    return 3;
  };
  return rank(left) - rank(right) || String(left.sourceName || "").localeCompare(String(right.sourceName || "")) || String(left.name || "").localeCompare(String(right.name || ""));
}

async function fetchNycTrafficCameras() {
  const records = await fetchJson(SOURCE_URLS.nycTrafficCameras, { timeoutMs: 12000 });
  return (Array.isArray(records) ? records : [])
    .map((record) => {
      const lat = Number(record.latitude);
      const lng = Number(record.longitude);
      const online = String(record.isOnline).toLowerCase() === "true";
      if (!online || !Number.isFinite(lat) || !Number.isFinite(lng) || !record.imageUrl) return null;
      const name = String(record.name || "NYC traffic camera").replace(/\s+/g, " ").trim();
      const area = String(record.area || "New York City").replace(/\s+/g, " ").trim();
      return {
        id: `nyc-${record.id}`,
        dynamic: true,
        type: "camera",
        name,
        shortName: shortCameraName(name || "NYC traffic"),
        area,
        region: "New York Metro",
        county: area,
        country: "United States",
        category: "traffic",
        media: "still",
        status: "Online",
        freshness: 1,
        tags: ["nyc", "new-york", "traffic", "dot", area],
        sourceId: "nyc-tmc",
        sourceName: "NYC DOT Traffic Cameras",
        sourceUrl: SOURCE_URLS.nycTrafficCameras,
        officialUrl: "https://webcams.nyctmc.org/",
        sourcePageUrl: "https://webcams.nyctmc.org/",
        lat,
        lng,
        viewerType: "image",
        capability: "snapshot",
        capabilityLabel: "Current Still",
        previewUrl: record.imageUrl,
        imageUrl: record.imageUrl,
        refreshSeconds: 60,
      };
    })
    .filter(Boolean);
}

async function fetchTflJamCams() {
  const records = await fetchJson(SOURCE_URLS.tflJamCams, { timeoutMs: 14000 });
  return (Array.isArray(records) ? records : [])
    .map((record) => {
      const lat = Number(record.lat);
      const lng = Number(record.lon);
      const props = Object.fromEntries(
        (record.additionalProperties || []).map((entry) => [entry.key, entry.value])
      );
      const available = String(props.available || "true").toLowerCase() !== "false";
      const imageUrl = normalizeUrl(props.imageUrl);
      const videoUrl = normalizeUrl(props.videoUrl);
      if (!available || !Number.isFinite(lat) || !Number.isFinite(lng) || (!imageUrl && !videoUrl)) return null;
      const name = cleanCameraText(record.commonName || props.view || "TfL JamCam");
      const view = cleanCameraText(props.view || "");
      return {
        id: `tfl-${slugify(record.id || name)}`,
        dynamic: true,
        type: "camera",
        name: view ? `${name} (${view})` : name,
        shortName: shortCameraName(name),
        area: "London",
        region: "London",
        county: "Greater London",
        country: "United Kingdom",
        category: "traffic",
        media: videoUrl ? "video" : "still",
        status: "Online",
        freshness: 1,
        tags: ["london", "uk", "tfl", "jamcam", "traffic", view].filter(Boolean),
        sourceId: "tfl-jamcams",
        sourceName: "Transport for London JamCams",
        sourceUrl: SOURCE_URLS.tflJamCams,
        officialUrl: "https://tfl.gov.uk/traffic/status/",
        sourcePageUrl: "https://tfl.gov.uk/traffic/status/",
        lat,
        lng,
        viewerType: videoUrl ? "video" : "image",
        capability: videoUrl ? "stream" : "snapshot",
        capabilityLabel: videoUrl ? "Video Clip" : "Current Still",
        previewUrl: imageUrl,
        imageUrl,
        streamUrl: videoUrl,
        refreshSeconds: 60,
      };
    })
    .filter(Boolean);
}

async function fetchHongKongTrafficCameras() {
  const data = await fetchJson(SOURCE_URLS.hongKongTrafficCameras, { timeoutMs: 18000 });
  return (data.features || [])
    .map((feature) => {
      const props = feature.properties || {};
      const [x, y] = feature.geometry?.coordinates || [];
      const point = webMercatorToLatLng(Number(x), Number(y));
      const imageUrl = normalizeUrl(props.url);
      if (!point || !imageUrl) return null;
      const name = cleanCameraText(props.description || props.F_key || "Hong Kong traffic camera");
      const district = cleanCameraText(props.district || props.region || "Hong Kong");
      return {
        id: `hk-td-${slugify(props.F_key || name)}`,
        dynamic: true,
        type: "camera",
        name,
        shortName: shortCameraName(name),
        area: district,
        region: cleanCameraText(props.region || "Hong Kong"),
        county: district,
        country: "Hong Kong",
        category: "traffic",
        media: "still",
        status: "Online",
        freshness: 2,
        tags: ["hong-kong", "transport-department", "traffic", district].filter(Boolean),
        sourceId: "hk-td-cctv",
        sourceName: "Hong Kong Traffic Snapshot Images",
        sourceUrl: SOURCE_URLS.hongKongTrafficCameras,
        officialUrl: "https://data.gov.hk/en-data/dataset/hk-td-tis_2-traffic-snapshot-images",
        sourcePageUrl: "https://data.gov.hk/en-data/dataset/hk-td-tis_2-traffic-snapshot-images",
        lat: point.lat,
        lng: point.lng,
        viewerType: "image",
        capability: "snapshot",
        capabilityLabel: "Current Still",
        previewUrl: imageUrl,
        imageUrl,
        refreshSeconds: 120,
      };
    })
    .filter(Boolean);
}

async function fetchMadridTrafficCameras() {
  const kml = await fetchText(SOURCE_URLS.madridTrafficKml, { timeoutMs: 18000, accept: "application/vnd.google-earth.kml+xml, application/xml, text/xml, */*" });
  const placemarks = String(kml || "").match(/<Placemark[\s\S]*?<\/Placemark>/gi) || [];
  return placemarks
    .map((placemark) => {
      const coordinates = firstRegex(placemark, /<coordinates>\s*([^<]+)\s*<\/coordinates>/i);
      const [lng, lat] = coordinates.split(",").map(Number);
      const numero = firstRegex(placemark, /<Data\s+name="Numero"[\s\S]*?<Value>([\s\S]*?)<\/Value>/i);
      const rawName = firstRegex(placemark, /<Data\s+name="Nombre"[\s\S]*?<Value>([\s\S]*?)<\/Value>/i) || `Madrid camera ${numero}`;
      const imageUrl = normalizeUrl(firstRegex(placemark, /img\s+src=([^"\s>]+)/i));
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !imageUrl) return null;
      const name = cleanCameraText(rawName);
      return {
        id: `madrid-${slugify(numero || name)}`,
        dynamic: true,
        type: "camera",
        name,
        shortName: shortCameraName(name),
        area: "Madrid",
        region: "Madrid",
        county: "Madrid",
        country: "Spain",
        category: "traffic",
        media: "still",
        status: "Online",
        freshness: 10,
        tags: ["madrid", "spain", "traffic", "city-camera"],
        sourceId: "madrid-traffic-kml",
        sourceName: "Madrid Traffic Cameras",
        sourceUrl: SOURCE_URLS.madridTrafficKml,
        officialUrl: "https://datos.madrid.es/",
        sourcePageUrl: "https://datos.madrid.es/",
        lat,
        lng,
        viewerType: "image",
        capability: "snapshot",
        capabilityLabel: "Current Still",
        previewUrl: imageUrl,
        imageUrl,
        refreshSeconds: 600,
      };
    })
    .filter(Boolean);
}

async function fetchSpainDgtCameras() {
  const xml = await fetchText(SOURCE_URLS.spainDgtCameras, { timeoutMs: 35000, accept: "application/xml, text/xml, */*" });
  const devices = String(xml || "").match(/<(?:[\w-]+:)?device\b[\s\S]*?<\/(?:[\w-]+:)?device>/gi) || [];
  return devices
    .map((device) => {
      if (!/>camera</i.test(device)) return null;
      const lat = Number(firstRegex(device, /<[^>]*latitude[^>]*>([^<]+)<\/[^>]*latitude>/i));
      const lng = Number(firstRegex(device, /<[^>]*longitude[^>]*>([^<]+)<\/[^>]*longitude>/i));
      const imageUrl = normalizeUrl(firstRegex(device, /<[^>]*deviceUrl[^>]*>([^<]+)<\/[^>]*deviceUrl>/i));
      const id = firstRegex(device, /<[^>]*device\b[^>]*\bid="([^"]+)"/i) || slugify(`${lat}-${lng}`);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !imageUrl) return null;
      const road = cleanCameraText(firstRegex(device, /<[^>]*roadName[^>]*>([^<]+)<\/[^>]*roadName>/i));
      const province = cleanCameraText(firstRegex(device, /<[^>]*province[^>]*>([^<]+)<\/[^>]*province>/i));
      const km = cleanCameraText(firstRegex(device, /<[^>]*kilometerPoint[^>]*>([^<]+)<\/[^>]*kilometerPoint>/i));
      const name = [road || "DGT camera", km ? `km ${km}` : "", province].filter(Boolean).join(" ");
      return {
        id: `dgt-${slugify(id)}`,
        dynamic: true,
        type: "camera",
        name,
        shortName: shortCameraName(name),
        area: province || road || "Spain",
        region: province || "Spain",
        county: province || "Spain",
        country: "Spain",
        category: "traffic",
        media: "still",
        status: "Online",
        freshness: 60,
        tags: ["spain", "dgt", "traffic", road, province].filter(Boolean),
        sourceId: "spain-dgt-datex",
        sourceName: "Spain DGT Cameras",
        sourceUrl: SOURCE_URLS.spainDgtCameras,
        officialUrl: "https://nap.dgt.es/",
        sourcePageUrl: "https://nap.dgt.es/",
        lat,
        lng,
        viewerType: "image",
        capability: "snapshot",
        capabilityLabel: "Current Still",
        previewUrl: imageUrl,
        imageUrl,
        refreshSeconds: 3600,
      };
    })
    .filter(Boolean);
}

async function fetchCarsProgramCameras(source) {
  const headers = source.origin
    ? {
        Origin: source.origin,
        Referer: `${source.origin}/`,
      }
    : undefined;
  const records = await fetchJson(source.url, {
    timeoutMs: 18000,
    headers,
  });
  return (Array.isArray(records) ? records : [])
    .flatMap((record) => {
      const lat = Number(record.location?.latitude);
      const lng = Number(record.location?.longitude);
      if (!record.public || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      const views = Array.isArray(record.views) && record.views.length ? record.views : [{ name: record.name }];
      return views
        .map((view, index) => {
          const primaryUrl = normalizeUrl(view.url);
          const streamUrl = /\.m3u8(?:$|\?)/i.test(primaryUrl) ? primaryUrl : "";
          const imageUrl = normalizeUrl(view.videoPreviewUrl) || (!streamUrl ? primaryUrl : "");
          if (!streamUrl && !imageUrl) return null;
          const name = cleanCameraText(view.name || record.name || `${source.region} traffic camera`);
          const route = cleanCameraText(record.location?.routeId || "");
          const city = cleanCameraText(record.location?.cityReference || "");
          return {
            id: `${source.idPrefix}-${record.id}-${index}`,
            dynamic: true,
            type: "camera",
            name,
            shortName: shortCameraName(name),
            area: city || route || source.region,
            region: source.region,
            county: city || route || source.region,
            country: "United States",
            category: "traffic",
            media: streamUrl ? "video" : "still",
            status: "Online",
            freshness: 1,
            tags: [...source.tags, route, city].filter(Boolean),
            sourceId: source.idPrefix,
            sourceName: source.sourceName,
            sourceUrl: source.url,
            officialUrl: source.officialUrl,
            sourcePageUrl: source.officialUrl,
            lat,
            lng,
            viewerType: streamUrl ? "hls" : "image",
            capability: streamUrl ? "stream" : "snapshot",
            capabilityLabel: streamUrl ? "Live Stream" : "Current Still",
            previewUrl: imageUrl,
            imageUrl,
            streamUrl,
            refreshSeconds: 60,
          };
        })
        .filter(Boolean);
    });
}

async function fetchMissouriSnapshotCameras() {
  const data = await fetchJson(SOURCE_URLS.missouriSnapshots, { timeoutMs: 12000 });
  return (data.cameras || [])
    .map((camera) => {
      const lat = Number(camera.location?.y);
      const lng = Number(camera.location?.x);
      const imageUrl = normalizeModotUrl(camera.url);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !imageUrl) return null;
      const name = cleanCameraText(camera.caption || "Missouri traffic camera");
      return {
        id: `modot-${slugify(camera.id || name)}`,
        dynamic: true,
        type: "camera",
        name,
        shortName: shortCameraName(name),
        area: "Missouri",
        region: "Missouri",
        county: "Missouri",
        country: "United States",
        category: "traffic",
        media: "still",
        status: "Online",
        freshness: 2,
        tags: ["missouri", "modot", "traffic"],
        sourceId: "modot",
        sourceName: "Missouri MoDOT Cameras",
        sourceUrl: SOURCE_URLS.missouriSnapshots,
        officialUrl: "https://traveler.modot.org/map/",
        sourcePageUrl: "https://traveler.modot.org/map/",
        lat,
        lng,
        viewerType: "image",
        capability: "snapshot",
        capabilityLabel: "Current Still",
        previewUrl: imageUrl,
        imageUrl,
        refreshSeconds: 120,
      };
    })
    .filter(Boolean);
}

async function fetchNorthDakotaCameras() {
  const data = await fetchJson(SOURCE_URLS.northDakotaCameras, { timeoutMs: 14000 });
  return (data.features || []).flatMap((feature) => {
    const [lng, lat] = feature?.geometry?.coordinates || [];
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return [];
    const region = cleanCameraText(feature?.properties?.Region || "North Dakota");
    return (feature?.properties?.Cameras || [])
      .map((camera, index) => {
        const imageUrl = normalizeUrl(camera.FullPath || camera.LinkPath);
        if (!imageUrl) return null;
        const name = cleanCameraText(camera.Description || `${region} traffic camera`);
        const direction = cleanCameraText(camera.Direction || "");
        return {
          id: `nddot-${feature.id}-${index}`,
          dynamic: true,
          type: "camera",
          name,
          shortName: shortCameraName(name),
          area: region,
          region: "North Dakota",
          county: region,
          country: "United States",
          category: "traffic",
          media: "still",
          status: "Online",
          freshness: 5,
          tags: ["north-dakota", "nddot", "511", "traffic", region, direction].filter(Boolean),
          sourceId: "nddot",
          sourceName: "North Dakota DOT Cameras",
          sourceUrl: SOURCE_URLS.northDakotaCameras,
          officialUrl: "https://travel.dot.nd.gov/",
          sourcePageUrl: "https://travel.dot.nd.gov/",
          lat: Number(lat),
          lng: Number(lng),
          viewerType: "image",
          capability: "snapshot",
          capabilityLabel: "Current Still",
          previewUrl: imageUrl,
          imageUrl,
          refreshSeconds: 300,
        };
      })
      .filter(Boolean);
  });
}

async function fetchV2RoadCameras(source) {
  const records = await fetchJson(source.url, { timeoutMs: 15000 });
  return (Array.isArray(records) ? records : []).flatMap((record) => {
    const lat = Number(record.Latitude);
    const lng = Number(record.Longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const location = cleanCameraText(record.Location || `${source.region} traffic camera`);
    const roadway = cleanCameraText(record.Roadway || "");
    const rawDirection = cleanCameraText(record.Direction || "");
    const direction = /^unknown$/i.test(rawDirection) ? "" : rawDirection;
    const views = Array.isArray(record.Views) && record.Views.length ? record.Views : [];
    return views
      .filter((view) => String(view.Status || "Enabled").toLowerCase() === "enabled")
      .map((view, index) => {
        const imageUrl = normalizeUrl(view.Url);
        if (!imageUrl) return null;
        const rawViewLabel = cleanCameraText(view.Description || direction || "");
        const viewLabel = /^unknown$/i.test(rawViewLabel) || /^-?\d+(?:\.\d+)?$/.test(rawViewLabel) ? "" : rawViewLabel;
        const name = viewLabel ? `${location} - ${viewLabel}` : location;
        return {
          id: `${source.idPrefix}-${record.Id}-${view.Id || index}`,
          dynamic: true,
          type: "camera",
          name,
          shortName: shortCameraName(name),
          area: location,
          region: source.region,
          county: location,
          country: source.country,
          category: "traffic",
          media: "still",
          status: "Online",
          freshness: 2,
          tags: [...source.tags, roadway, direction, viewLabel].filter(Boolean),
          sourceId: source.idPrefix,
          sourceName: source.sourceName,
          sourceUrl: source.url,
          officialUrl: source.officialUrl,
          sourcePageUrl: source.officialUrl,
          lat,
          lng,
          viewerType: "image",
          capability: "snapshot",
          capabilityLabel: "Current Still",
          previewUrl: imageUrl,
          imageUrl,
          refreshSeconds: 120,
        };
      })
      .filter(Boolean);
  });
}

async function fetchFintrafficWeathercams() {
  const [stationMetadata, stationData] = await Promise.all([
    fetchJson(SOURCE_URLS.fintrafficWeathercams, {
      timeoutMs: 15000,
      headers: { "Digitraffic-User": "Oversee local public camera dashboard" },
    }),
    fetchJson(SOURCE_URLS.fintrafficWeathercamData, {
      timeoutMs: 15000,
      headers: { "Digitraffic-User": "Oversee local public camera dashboard" },
    }),
  ]);
  const livePresetIds = new Set(
    (stationData.stations || []).flatMap((station) =>
      (station.presets || []).filter((preset) => preset.measuredTime).map((preset) => preset.id)
    )
  );
  return (stationMetadata.features || []).flatMap((feature) => {
    const [lng, lat] = feature?.geometry?.coordinates || [];
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return [];
    const stationName = cleanCameraText(feature?.properties?.name || feature?.properties?.id || "Fintraffic weathercam");
    const stationId = cleanCameraText(feature?.properties?.id || stationName);
    return (feature?.properties?.presets || [])
      .filter((preset) => preset.inCollection && livePresetIds.has(preset.id))
      .map((preset) => {
        const imageUrl = `https://weathercam.digitraffic.fi/${preset.id}.jpg`;
        const name = `${stationName} ${preset.id.slice(-2)}`;
        return {
          id: `fintraffic-${preset.id}`,
          dynamic: true,
          type: "camera",
          name,
          shortName: shortCameraName(name),
          area: stationName,
          region: "Finland",
          county: stationName,
          country: "Finland",
          category: "traffic",
          media: "still",
          status: "Online",
          freshness: 1,
          tags: ["finland", "fintraffic", "digitraffic", "weathercam", "traffic", stationId],
          sourceId: "fintraffic-weathercams",
          sourceName: "Fintraffic Weather Cameras",
          sourceUrl: SOURCE_URLS.fintrafficWeathercams,
          officialUrl: "https://www.digitraffic.fi/en/road-traffic/",
          sourcePageUrl: "https://www.digitraffic.fi/en/road-traffic/",
          lat: Number(lat),
          lng: Number(lng),
          viewerType: "image",
          capability: "snapshot",
          capabilityLabel: "Current Still",
          previewUrl: imageUrl,
          imageUrl,
          refreshSeconds: 60,
        };
      });
  });
}

async function fetchArizona511Cameras() {
  const pageSize = 100;
  const rows = [];
  let total = Infinity;
  for (let start = 0; start < total && start < 1200; start += pageSize) {
    const data = await fetchJson(SOURCE_URLS.arizonaListCameras, {
      method: "POST",
      body: buildArizonaCameraForm(start, pageSize),
      timeoutMs: 18000,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Referer: "https://az511.com/list/cameras",
        Origin: "https://az511.com",
      },
    });
    total = Number(data.recordsFiltered || data.recordsTotal || 0) || total;
    const page = data.data || [];
    rows.push(...page);
    if (!page.length || page.length < pageSize) break;
  }

  return rows
    .flatMap((record) => {
      const point = parseWellKnownPoint(record.latLng?.geography?.wellKnownText);
      const lat = point?.lat;
      const lng = point?.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      return (record.images || [])
        .map((image, index) => {
          if (image.disabled || image.blocked || !image.imageUrl) return null;
          const imageUrl = new URL(image.imageUrl, "https://az511.com").href;
          const name = cleanCameraText(image.description || record.location || "Arizona 511 camera");
          return {
            id: `az511-${record.id}-${image.id || index}`,
            dynamic: true,
            type: "camera",
            name,
            shortName: shortCameraName(name),
            area: record.city || record.county || record.roadway || "Arizona",
            region: "Arizona",
            county: record.county || record.city || "Arizona",
            country: "United States",
            category: "traffic",
            media: "still",
            status: "Online",
            freshness: 2,
            tags: ["arizona", "az511", "adot", "traffic", record.roadway, record.city, record.county].filter(Boolean),
            sourceId: "az511",
            sourceName: "Arizona 511 Cameras",
            sourceUrl: SOURCE_URLS.arizonaListCameras,
            officialUrl: "https://az511.com/list/cameras",
            sourcePageUrl: "https://az511.com/list/cameras",
            lat,
            lng,
            viewerType: "image",
            capability: "snapshot",
            capabilityLabel: "Current Still",
            previewUrl: imageUrl,
            imageUrl,
            refreshSeconds: 120,
          };
        })
        .filter(Boolean);
    });
}

function buildArizonaCameraForm(start, length) {
  const form = new URLSearchParams();
  form.set("draw", "1");
  form.set("start", String(start));
  form.set("length", String(length));
  form.set("search[value]", "");
  form.set("order[0][column]", "0");
  form.set("order[0][dir]", "asc");
  const columns = [
    ["sortOrder", false],
    ["city", true],
    ["roadway", true],
    ["location", false],
  ];
  columns.forEach(([name, searchable], index) => {
    form.set(`columns[${index}][data]`, name);
    form.set(`columns[${index}][name]`, name);
    form.set(`columns[${index}][orderable]`, "true");
    form.set(`columns[${index}][searchable]`, searchable ? "true" : "false");
  });
  return form.toString();
}

async function fetchAustinTrafficCameras() {
  const url = new URL(SOURCE_URLS.austinTrafficCameras);
  url.searchParams.set("$limit", "5000");
  const rows = await fetchJson(url.href, { timeoutMs: 16000 });
  return (Array.isArray(rows) ? rows : [])
    .map((record) => {
      const coords = record.location?.coordinates || [];
      const lng = Number(coords[0] ?? record.longitude ?? record.lng);
      const lat = Number(coords[1] ?? record.latitude ?? record.lat);
      const imageUrl = normalizeUrl(record.screenshot_address || record.screenshot_url || record.image_url);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !imageUrl) return null;
      const rawName = cleanCameraText(record.location_name || record.camera_id || "Austin traffic camera");
      const name = rawName.replace(/^\s*\/\s*/, "").replace(/\s+\/\s+/g, " / ");
      const area = cleanCameraText(record.signal_eng_area || record.jurisdiction_label || "Austin");
      return {
        id: `austin-${slugify(record.camera_id || record.id || name)}`,
        dynamic: true,
        type: "camera",
        name,
        shortName: shortCameraName(name),
        area: area || "Austin",
        region: "Texas",
        county: "Travis",
        country: "United States",
        category: "traffic",
        media: "still",
        status: cleanCameraText(record.camera_status || "Online") || "Online",
        freshness: 1,
        tags: ["austin", "texas", "traffic", "open-data", area].filter(Boolean),
        sourceId: "austin-open-data",
        sourceName: "Austin Traffic Cameras",
        sourceUrl: SOURCE_URLS.austinTrafficCameras,
        officialUrl: "https://data.austintexas.gov/Transportation-and-Mobility/Traffic-Cameras/b4k4-adkb",
        sourcePageUrl: "https://data.austintexas.gov/Transportation-and-Mobility/Traffic-Cameras/b4k4-adkb",
        lat,
        lng,
        viewerType: "image",
        capability: "snapshot",
        capabilityLabel: "Current Still",
        previewUrl: imageUrl,
        imageUrl,
        refreshSeconds: 60,
      };
    })
    .filter(Boolean);
}

async function fetchSingaporeTrafficImages() {
  const data = await fetchJson(SOURCE_URLS.singaporeTrafficImages, { timeoutMs: 12000 });
  const item = Array.isArray(data.items) ? data.items[0] : null;
  const cameras = Array.isArray(item?.cameras) ? item.cameras : [];
  return cameras
    .map((camera) => {
      const lat = Number(camera.location?.latitude);
      const lng = Number(camera.location?.longitude);
      const imageUrl = normalizeUrl(camera.image);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !imageUrl) return null;
      const id = cleanCameraText(camera.camera_id || `${lat}-${lng}`);
      const timestamp = camera.timestamp || item?.timestamp || "";
      return {
        id: `sg-traffic-${slugify(id)}`,
        dynamic: true,
        type: "camera",
        name: `Singapore Traffic Camera ${id}`,
        shortName: `SG ${id}`,
        area: "Singapore",
        region: "Singapore",
        county: "Singapore",
        country: "Singapore",
        category: "traffic",
        media: "still",
        status: "Online",
        freshness: 1,
        tags: ["singapore", "data-gov-sg", "traffic", "camera", id].filter(Boolean),
        sourceId: "singapore-traffic-images",
        sourceName: "Singapore Traffic Images",
        sourceUrl: SOURCE_URLS.singaporeTrafficImages,
        officialUrl: "https://data.gov.sg/datasets/d_6cdb6b405b25aaaacbaf7689bcc6fae0/view",
        sourcePageUrl: "https://data.gov.sg/datasets/d_6cdb6b405b25aaaacbaf7689bcc6fae0/view",
        lat,
        lng,
        viewerType: "image",
        capability: "snapshot",
        capabilityLabel: "Current Still",
        previewUrl: imageUrl,
        imageUrl,
        refreshSeconds: 60,
        observedAt: timestamp,
      };
    })
    .filter(Boolean);
}

async function fetchNztaTrafficCameras() {
  const xml = await fetchText(SOURCE_URLS.nztaTrafficCameras, { timeoutMs: 20000, accept: "application/xml, text/xml, */*" });
  const cameras = String(xml || "").match(/<camera>[\s\S]*?<\/camera>/gi) || [];
  return cameras
    .map((entry) => {
      const id = xmlValue(entry, "id");
      const lat = Number(xmlValue(entry, "latitude"));
      const lng = Number(xmlValue(entry, "longitude"));
      const offline = /^true$/i.test(xmlValue(entry, "offline"));
      const maintenance = /^true$/i.test(xmlValue(entry, "underMaintenance"));
      const imagePath = xmlValue(entry, "imageUrl");
      const thumbPath = xmlValue(entry, "thumbUrl");
      if (!id || offline || maintenance || !Number.isFinite(lat) || !Number.isFinite(lng) || !imagePath) return null;
      const cameraName = firstRegex(entry, /<longitude>[\s\S]*?<\/longitude>\s*<name>([\s\S]*?)<\/name>/i);
      const name = cleanCameraText(cameraName || xmlValue(entry, "description") || `NZTA camera ${id}`);
      const region = cleanCameraText(firstRegex(entry, /<region>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/region>/i) || "New Zealand");
      const highway = cleanCameraText(xmlValue(entry, "highway"));
      const journeyLeg = cleanCameraText(firstRegex(entry, /<journeyLeg>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/journeyLeg>/i));
      const viewPath = xmlValue(entry, "viewUrl");
      const imageUrl = new URL(imagePath, "https://trafficnz.info").href;
      return {
        id: `nzta-${slugify(id)}`,
        dynamic: true,
        type: "camera",
        name,
        shortName: shortCameraName(name),
        area: journeyLeg || highway || region,
        region,
        county: region,
        country: "New Zealand",
        category: "traffic",
        media: "still",
        status: "Online",
        freshness: 2,
        tags: ["new-zealand", "nzta", "traffic", highway, region].filter(Boolean),
        sourceId: "nzta-traffic",
        sourceName: "NZTA Traffic Cameras",
        sourceUrl: SOURCE_URLS.nztaTrafficCameras,
        officialUrl: "https://trafficnz.info/",
        sourcePageUrl: viewPath ? new URL(viewPath, "https://trafficnz.info").href : "https://trafficnz.info/",
        lat,
        lng,
        viewerType: "image",
        capability: "snapshot",
        capabilityLabel: "Current Still",
        previewUrl: thumbPath ? new URL(thumbPath, "https://trafficnz.info").href : imageUrl,
        imageUrl,
        refreshSeconds: 120,
      };
    })
    .filter(Boolean);
}

async function fetchTravelIqCameras(source) {
  const url = new URL(source.url);
  url.searchParams.set("key", source.key);
  url.searchParams.set("format", "json");
  const records = await fetchJson(url.href, { timeoutMs: 20000 });
  return (Array.isArray(records) ? records : [])
    .flatMap((record) => {
      const lat = Number(record.Latitude ?? record.latitude);
      const lng = Number(record.Longitude ?? record.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      const views = Array.isArray(record.Views) && record.Views.length ? record.Views : [{ Id: record.Id, Description: record.Location, Url: record.Url, VideoUrl: record.VideoUrl, Status: "Enabled" }];
      return views.map((view, index) => {
        if (String(view.Status || "Enabled").toLowerCase() !== "enabled") return null;
        const streamUrl = normalizeUrl(view.VideoUrl || view.videoUrl);
        const sourcePageUrl = normalizeUrl(view.Url || view.url) || source.officialUrl;
        if (!streamUrl && !sourcePageUrl) return null;
        const name = cleanCameraText(view.Description || record.Location || record.Roadway || `${source.region} traffic camera`);
        const county = cleanCameraText(record.County || record.county || source.region);
        const roadway = cleanCameraText(record.Roadway || record.roadway || "");
        return {
          id: `${source.idPrefix}-${record.Id || record.id || "camera"}-${view.Id || view.id || index}`,
          dynamic: true,
          type: "camera",
          name,
          shortName: shortCameraName(name),
          area: cleanCameraText(record.Location || roadway || county || source.region),
          region: source.region,
          county,
          country: source.country,
          category: "traffic",
          media: streamUrl ? "video" : "source",
          status: "Online",
          freshness: 2,
          tags: [...source.tags, roadway, county, record.Direction].filter(Boolean),
          sourceId: source.idPrefix,
          sourceName: source.sourceName,
          sourceUrl: source.url,
          officialUrl: source.officialUrl,
          sourcePageUrl,
          lat,
          lng,
          viewerType: streamUrl ? "hls" : "page",
          capability: streamUrl ? "stream" : "candidate",
          capabilityLabel: streamUrl ? "Live Stream" : "Source Page",
          previewUrl: "",
          imageUrl: "",
          streamUrl,
          refreshSeconds: 120,
        };
      }).filter(Boolean);
    });
}

async function fetchNswTrafficCameras(apiKey) {
  const data = await fetchJson(SOURCE_URLS.nswTrafficCameras, {
    timeoutMs: 18000,
    headers: { Authorization: `apikey ${apiKey}` },
  });
  const features = Array.isArray(data.features) ? data.features : [];
  return features
    .map((feature, index) => {
      const props = feature.properties || {};
      const [lng, lat] = feature.geometry?.coordinates || [props.longitude, props.latitude];
      const imageUrl = normalizeUrl(props.href || props.imageUrl || props.image_url || props.url);
      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || !imageUrl) return null;
      const name = cleanCameraText(props.title || props.name || props.view || `NSW traffic camera ${index + 1}`);
      const area = cleanCameraText(props.region || props.suburb || props.road || "New South Wales");
      return {
        id: `nsw-${slugify(props.id || props.cameraId || name || index)}`,
        dynamic: true,
        type: "camera",
        name,
        shortName: shortCameraName(name),
        area,
        region: "New South Wales",
        county: area,
        country: "Australia",
        category: "traffic",
        media: "still",
        status: "Online",
        freshness: 2,
        tags: ["australia", "new-south-wales", "nsw", "transport-nsw", "traffic", area].filter(Boolean),
        sourceId: "nsw-live-traffic",
        sourceName: "NSW Live Traffic Cameras",
        sourceUrl: SOURCE_URLS.nswTrafficCameras,
        officialUrl: "https://opendata.transport.nsw.gov.au/",
        sourcePageUrl: "https://opendata.transport.nsw.gov.au/",
        lat: Number(lat),
        lng: Number(lng),
        viewerType: "image",
        capability: "snapshot",
        capabilityLabel: "Current Still",
        previewUrl: imageUrl,
        imageUrl,
        refreshSeconds: 120,
      };
    })
    .filter(Boolean);
}

async function fetchCaltransCameras() {
  const results = await Promise.allSettled(
    CALTRANS_DISTRICTS.map((district) => fetchJson(caltransDistrictUrl(district), { timeoutMs: 14000 }))
  );

  return results.flatMap((result, index) => {
    if (result.status !== "fulfilled") return [];
    const district = CALTRANS_DISTRICTS[index];
    return (result.value.data || [])
      .map((entry) => mapCaltransCamera(entry?.cctv || entry, district))
      .filter(Boolean);
  });
}

function mapCaltransCamera(cctv, district) {
  const location = cctv?.location || {};
  const imageData = cctv?.imageData || {};
  const staticData = imageData.static || {};
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  const imageUrl = staticData.currentImageURL || "";
  const streamUrl = imageData.streamingVideoURL || "";
  const inService = String(cctv?.inService).toLowerCase() !== "false";
  if (!inService || !Number.isFinite(lat) || !Number.isFinite(lng) || (!imageUrl && !streamUrl)) return null;

  const nearbyPlace = location.nearbyPlace || location.county || "California";
  const route = [location.route, location.direction].filter(Boolean).join(" ");
  const rawName = cleanCaltransName(location.locationName || cctv.index || route || "Caltrans CCTV");
  const freshness = Number(staticData.currentImageUpdateFrequency || 0) || 5;

  return {
    id: `caltrans-d${district}-${slugify(rawName || imageUrl)}-${cctv.index || "cam"}`,
    dynamic: true,
    type: "camera",
    name: rawName,
    shortName: shortCameraName(rawName),
    area: nearbyPlace,
    region: `California District ${district}`,
    county: location.county || nearbyPlace,
    country: "United States",
    category: "traffic",
    media: streamUrl ? "video-candidate" : "still",
    status: "Online",
    freshness,
    tags: ["caltrans", "california", "traffic", "dot", route, nearbyPlace, location.county].filter(Boolean),
    sourceId: "caltrans-cctv",
    sourceName: "Caltrans CCTV",
    sourceUrl: caltransDistrictUrl(district),
    officialUrl: "https://quickmap.dot.ca.gov/",
    sourcePageUrl: "https://quickmap.dot.ca.gov/",
    lat,
    lng,
    viewerType: streamUrl ? "hls" : "image",
    capability: streamUrl ? "candidate" : "snapshot",
    capabilityLabel: streamUrl ? "Video Candidate" : "Current Still",
    previewUrl: imageUrl,
    imageUrl,
    streamUrl,
    refreshSeconds: Math.max(30, freshness * 60),
  };
}

function caltransDistrictUrl(district) {
  return `https://cwwp2.dot.ca.gov/data/d${district}/cctv/cctvStatusD${String(district).padStart(2, "0")}.json`;
}

async function fetchArcgisCameras(source) {
  const features = [];
  const pageSize = source.pageSize || 1000;
  const maxRecords = source.maxRecords || 8000;
  for (let offset = 0; offset < maxRecords; offset += pageSize) {
    const url = new URL(source.url);
    url.searchParams.set("where", source.where || "1=1");
    url.searchParams.set("outFields", "*");
    url.searchParams.set("returnGeometry", "true");
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("resultRecordCount", String(pageSize));
    url.searchParams.set("resultOffset", String(offset));
    url.searchParams.set("f", "json");
    const data = await fetchJson(url.href, { timeoutMs: 18000 });
    const page = data.features || [];
    features.push(...page);
    if (!data.exceededTransferLimit && page.length < pageSize) break;
  }

  return features
    .map((feature) => mapArcgisCamera(feature, source))
    .filter(Boolean);
}

function mapArcgisCamera(feature, source) {
  const attributes = feature?.attributes || {};
  if (!isArcgisCameraEnabled(attributes, source)) return null;
  const attrLat = attributes.LATITUDE ?? attributes.Latitude ?? attributes.latitude ?? attributes.Lat ?? attributes.lat;
  const attrLng = attributes.LONGITUDE ?? attributes.Longitude ?? attributes.longitude ?? attributes.Lon ?? attributes.lng;
  const lat = source.useGeometryCoordinates || !validLat(attrLat) ? Number(feature?.geometry?.y) : Number(attrLat);
  const lng = source.useGeometryCoordinates || !validLng(attrLng) ? Number(feature?.geometry?.x) : Number(attrLng);
  const imageUrl = source.sourceOnly ? "" : normalizeUrl(firstFieldValue(attributes, source.imageFields));
  const streamUrl = source.trustHls ? normalizeUrl(firstFieldValue(attributes, source.streamFields)) : "";
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (!source.sourceOnly && !imageUrl && !streamUrl)) return null;

  const objectId =
    attributes.OBJECTID ??
    attributes.ObjectId ??
    attributes.OBJECTID_1 ??
    attributes.FID ??
    attributes.OID ??
    attributes.oid ??
    attributes.device_id ??
    attributes.CameraViewId ??
    attributes.id ??
    attributes.ID ??
    slugify(`${imageUrl}|${streamUrl}|${lat}|${lng}`);
  const nameParts = (source.nameFields || []).map((field) => cleanCameraText(attributes[field])).filter(Boolean);
  const areaParts = (source.areaFields || []).map((field) => cleanCameraText(attributes[field])).filter(Boolean);
  const name = nameParts.length ? dedupeParts(nameParts).join(" @ ") : `${source.name} ${objectId}`;
  const area = areaParts[0] || source.region || source.country || "Public camera";

  return {
    id: `arcgis-${source.id}-${slugify(objectId)}`,
    dynamic: true,
    type: "camera",
    name,
    shortName: shortCameraName(name),
    area,
    region: source.region,
    county: area,
    country: source.country,
    category: source.category || "traffic",
    media: streamUrl ? "video" : source.sourceOnly ? "source" : "still",
    status: source.sourceOnly ? "Source page" : "Online",
    freshness: Math.round((source.refreshSeconds || 180) / 60),
    tags: [...(source.tags || []), area, source.region, source.country].filter(Boolean),
    sourceId: `arcgis-${source.id}`,
    sourceName: source.name,
    sourceUrl: source.url,
    officialUrl: source.officialUrl || source.url,
    sourcePageUrl: normalizeUrl(firstFieldValue(attributes, source.sourcePageFields)) || source.sourcePageUrl || source.officialUrl || source.url,
    lat,
    lng,
    viewerType: streamUrl ? "hls" : source.sourceOnly ? "page" : "image",
    capability: streamUrl ? "stream" : source.sourceOnly ? "candidate" : "snapshot",
    capabilityLabel: streamUrl ? "Live Stream" : source.sourceOnly ? "Source Page" : "Current Still",
    previewUrl: imageUrl,
    imageUrl,
    streamUrl,
    refreshSeconds: source.refreshSeconds || 180,
  };
}

function isArcgisCameraEnabled(attributes, source) {
  if (source.requiredStatus?.field) {
    const value = String(attributes[source.requiredStatus.field] ?? "").trim().toLowerCase();
    const allowed = (source.requiredStatus.values || []).map((item) => String(item).toLowerCase());
    if (allowed.length && !allowed.includes(value)) return false;
  }
  const disabledValues = (source.disabledStatusValues || []).map((item) => String(item).toLowerCase());
  if (disabledValues.length) {
    for (const field of source.disabledStatusFields || []) {
      const value = String(attributes[field] ?? "").trim().toLowerCase();
      if (disabledValues.includes(value)) return false;
    }
  }
  return true;
}

function validLat(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= -90 && number <= 90;
}

function validLng(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= -180 && number <= 180;
}

function firstFieldValue(attributes, fields = []) {
  for (const field of fields || []) {
    const value = attributes[field];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return "";
}

function normalizeUrl(value) {
  const text = cleanCameraText(value);
  if (!/^https?:\/\//i.test(text)) return "";
  return text;
}

function firstRegex(text, pattern) {
  const match = String(text || "").match(pattern);
  return cleanCameraText(match?.[1] || "");
}

function xmlValue(text, tagName) {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  return decodeHtmlEntities(firstRegex(text, pattern));
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function webMercatorToLatLng(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const lng = (x / 20037508.34) * 180;
  let lat = (y / 20037508.34) * 180;
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
  if (!validLat(lat) || !validLng(lng)) return null;
  return { lat, lng };
}

function normalizeModotUrl(value) {
  const text = cleanCameraText(value);
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return new URL(text, "https://traveler.modot.org/").href;
}

function parseWellKnownPoint(value) {
  const match = /POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i.exec(String(value || ""));
  if (!match) return null;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function cleanCameraText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeParts(parts) {
  const seen = new Set();
  return parts.filter((part) => {
    const key = part.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanCaltransName(value) {
  return String(value || "Caltrans CCTV")
    .replace(/^\s*TV[A-Z0-9]*\s*--\s*/i, "")
    .replace(/^\s*\([^)]+\)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveCatalogViewer(feed, meta) {
  if (KNOWN_LIVE_PLAYER_VIEWS[feed.id]) {
    return resolveKnownPlayerView(feed, meta);
  }

  const viewer = meta.viewer || {};
  if (viewer.type === "image") {
    return {
      type: "image",
      url: viewer.url,
      previewUrl: viewer.url,
      imageUrl: viewer.url,
      capability: "snapshot",
      sourcePageUrl: feed.url,
    };
  }

  if (FALLBACK_STILL_URLS[feed.id]) {
    return {
      type: "image",
      url: FALLBACK_STILL_URLS[feed.id],
      previewUrl: FALLBACK_STILL_URLS[feed.id],
      imageUrl: FALLBACK_STILL_URLS[feed.id],
      capability: "snapshot",
      sourcePageUrl: feed.url,
    };
  }

  if (viewer.type === "iframe") {
    return {
      type: "iframe",
      url: viewer.url,
      capability: "page",
      sourcePageUrl: viewer.url,
    };
  }

  return {
    type: "source",
    url: feed.url,
    capability: "source",
    sourcePageUrl: feed.url,
  };
}

async function resolveKnownPlayerView(feed, meta = {}) {
  const known = KNOWN_LIVE_PLAYER_VIEWS[feed.id];
  const stillUrl = FALLBACK_STILL_URLS[feed.id] || (meta.viewer?.type === "image" ? meta.viewer.url : "");
  const status = await verifyKnownEmbedPlayer(known);
  if (status.ok) {
    return {
      ...known,
      previewUrl: stillUrl,
      imageUrl: stillUrl,
      capability: "player",
    };
  }

  if (stillUrl) {
    return {
      type: "image",
      url: stillUrl,
      previewUrl: stillUrl,
      imageUrl: stillUrl,
      capability: "snapshot",
      sourcePageUrl: known.sourcePageUrl || feed.url,
      sourceLabel: "Current still fallback",
      offlineReason: status.message,
    };
  }

  return {
    ...known,
    previewUrl: "",
    imageUrl: "",
    capability: "candidate",
    offlineReason: status.message,
  };
}

async function verifyKnownEmbedPlayer(view) {
  if (!view || view.type !== "iframe" || !/camstreamer\.com/i.test(view.url || "")) {
    return { ok: true };
  }

  const result = await getCached(`embed:${view.url}`, 2 * 60 * 1000, async () => {
    const response = await fetch(view.url, {
      headers: {
        "User-Agent": "Oversee/0.3 (+local public intelligence dashboard)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`embed returned ${response.status}`);
    const text = await response.text();
    if (/<title>\s*Stream isn[’']t live now\.?\s*<\/title>/i.test(text) || /Stream isn[’']t live now\./i.test(text.slice(0, 2000))) {
      throw new Error("embedded player reports stream is not live");
    }
    return { available: true };
  });

  return result.ok ? { ok: true } : { ok: false, message: result.message || "embedded player unavailable" };
}

async function resolveFeedView(feedId) {
  const dynamicCamera = DYNAMIC_CAMERAS_BY_ID.get(feedId) || dynamicCameraFromId(feedId);
  if (dynamicCamera) return resolveDynamicFeedView(dynamicCamera);

  const feed = FEEDS_BY_ID.get(feedId);
  if (!feed) {
    return {
      type: "unavailable",
      sourceLabel: "Unknown feed",
      note: "The requested feed id is not in the camera catalog.",
    };
  }

  if (KNOWN_LIVE_PLAYER_VIEWS[feedId]) {
    const knownView = await resolveKnownPlayerView(feed, META[feedId] || {});
    if (knownView.type === "image") {
      return {
        feedId,
        generatedAt: new Date().toISOString(),
        type: "image",
        url: knownView.imageUrl || knownView.url,
        sourceLabel: "Embedded player offline; current still fallback",
        sourcePageUrl: knownView.sourcePageUrl || feed.url,
        capability: "snapshot",
        streamStatus: "down",
        note: `The embedded public player reports it is not live right now. Showing the refreshed still image instead.`,
      };
    }
    return {
      feedId,
      generatedAt: new Date().toISOString(),
      officialUrl: feed.url,
      note: "Known public live player mapping.",
      ...knownView,
    };
  }

  const metaViewer = META[feedId]?.viewer;
  if (metaViewer?.type === "image") {
    return {
      feedId,
      generatedAt: new Date().toISOString(),
      type: "image",
      url: metaViewer.url,
      sourceLabel: "Mapped public current image",
      sourcePageUrl: feed.url,
      capability: "snapshot",
      note: "This public source exposes a refreshed image rather than true video.",
    };
  }

  if (FALLBACK_STILL_URLS[feedId]) {
    return {
      feedId,
      generatedAt: new Date().toISOString(),
      type: "image",
      url: FALLBACK_STILL_URLS[feedId],
      sourceLabel: "Mapped public still image",
      sourcePageUrl: feed.url,
      capability: "snapshot",
      note: "This camera currently resolves to a public still image endpoint.",
    };
  }

  if (metaViewer?.type === "iframe") {
    return {
      feedId,
      generatedAt: new Date().toISOString(),
      type: "iframe",
      url: metaViewer.url,
      sourceLabel: "Official public source page",
      sourcePageUrl: metaViewer.url,
      capability: "page",
      note: "This source is available as a public page, not a direct extracted stream yet.",
    };
  }

  return {
    feedId,
    generatedAt: new Date().toISOString(),
    type: "iframe",
    url: feed.url,
    sourceLabel: "Official public source page",
    sourcePageUrl: feed.url,
    capability: "source",
    note: "No direct dashboard player has been verified for this feed yet.",
  };
}

function dynamicCameraFromId(feedId) {
  if (String(feedId || "").startsWith("nyc-")) {
    const cameraId = feedId.slice(4);
    if (/^[0-9a-f-]{32,}$/i.test(cameraId)) {
      const imageUrl = `https://webcams.nyctmc.org/api/cameras/${cameraId}/image`;
      return {
        id: feedId,
        dynamic: true,
        name: "NYC traffic camera",
        sourceName: "NYC DOT Traffic Cameras",
        sourcePageUrl: "https://webcams.nyctmc.org/",
        officialUrl: "https://webcams.nyctmc.org/",
        viewerType: "image",
        capability: "snapshot",
        capabilityLabel: "Current Still",
        imageUrl,
        previewUrl: imageUrl,
        refreshSeconds: 60,
      };
    }
  }
  return null;
}

async function resolveDynamicFeedView(camera) {
  const base = {
    feedId: camera.id,
    generatedAt: new Date().toISOString(),
    officialUrl: camera.officialUrl || camera.sourcePageUrl || camera.sourceUrl,
    sourcePageUrl: camera.sourcePageUrl || camera.officialUrl || camera.sourceUrl,
    capability: camera.capability || "snapshot",
    refreshSeconds: camera.refreshSeconds || 60,
  };

  if (camera.viewerType === "video" && camera.streamUrl) {
    const videoResult = await verifyVideoAsset(camera.streamUrl);
    if (videoResult.ok) {
      return {
        ...base,
        type: "video",
        url: camera.streamUrl,
        sourceLabel: `${camera.sourceName || "Public source"} public video feed`,
        capability: "stream",
        note: "This source exposes a direct public video asset, so the dashboard can play it in-pane.",
      };
    }

    if (camera.imageUrl) {
      return {
        ...base,
        type: "image",
        url: camera.imageUrl,
        sourceLabel: `${camera.sourceName || "Public source"} current image fallback`,
        capability: "snapshot",
        streamStatus: "down",
        note: `The source advertises a video asset, but it did not validate right now (${videoResult.message || "unavailable"}). Showing the refreshed public image instead.`,
      };
    }
  }

  if (camera.viewerType === "hls" && camera.streamUrl) {
    const hlsResult = await verifyHlsPlaylist(camera.streamUrl);
    if (hlsResult.ok) {
      return {
        ...base,
        type: "hls",
        url: camera.streamUrl,
        sourceLabel: `${camera.sourceName || "Public source"} live HLS stream`,
        capability: "player",
        note: "This source exposes a direct HLS playlist, so the dashboard can play it in-pane.",
      };
    }

    if (camera.imageUrl) {
      return {
        ...base,
        type: "image",
        url: camera.imageUrl,
        sourceLabel: `${camera.sourceName || "Public source"} current image fallback`,
        capability: "snapshot",
        streamStatus: "down",
        note: `The source advertises a video stream, but it did not validate right now (${hlsResult.message || "unavailable"}). Showing the refreshed public image instead.`,
      };
    }
  }

  if (camera.imageUrl || camera.previewUrl) {
    return {
      ...base,
      type: "image",
      url: camera.imageUrl || camera.previewUrl,
      sourceLabel: `${camera.sourceName || "Public source"} current image`,
      capability: "snapshot",
      note: "This public source exposes a refreshed image feed rather than a browser-playable video stream.",
    };
  }

  return {
    ...base,
    type: "iframe",
    url: camera.sourcePageUrl || camera.officialUrl || camera.sourceUrl,
    sourceLabel: camera.sourceName || "Official public source page",
    capability: "source",
    note: "No direct dashboard media endpoint has been verified for this camera.",
  };
}

async function verifyHlsPlaylist(url) {
  const result = await getCached(`hls:${url}`, 5 * 60 * 1000, async () => {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Oversee/0.3 (+local public intelligence dashboard)",
        Accept: "application/vnd.apple.mpegurl, application/x-mpegURL, text/plain;q=0.9, */*;q=0.8",
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error(`stream returned ${response.status}`);
    const text = await response.text();
    if (!/^#EXTM3U/m.test(text)) throw new Error("response is not an HLS playlist");
    return { ok: true };
  });

  return result.ok ? { ok: true } : { ok: false, message: result.message || "stream unavailable" };
}

async function verifyVideoAsset(url) {
  const result = await getCached(`video:${url}`, 5 * 60 * 1000, async () => {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Oversee/0.3 (+local public intelligence dashboard)",
        Accept: "video/*,*/*;q=0.8",
        Range: "bytes=0-1",
      },
      signal: AbortSignal.timeout(5500),
    });
    if (!response.ok && response.status !== 206) throw new Error(`video returned ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (contentType && !/video|octet-stream|binary/i.test(contentType) && !/\.(?:mp4|m4v|webm)(?:$|\?)/i.test(url)) {
      throw new Error(`unexpected content type ${contentType}`);
    }
    return { ok: true };
  });

  return result.ok ? { ok: true } : { ok: false, message: result.message || "video unavailable" };
}

async function fetchSatellites(scope) {
  let records;
  try {
    records = await fetchJson(SOURCE_URLS.celestrakActive, { timeoutMs: 25000 });
  } catch {
    records = await fetchCelesTrakFallbackGroups();
  }

  const now = Date.now();
  const maxSource = scope === "world" ? 5000 : scope === "us" ? 3200 : 1800;
  return deterministicSample(records || [], maxSource, "NORAD_CAT_ID")
    .map((record) => deriveSatellite(record, now))
    .filter(Boolean);
}

async function fetchCelesTrakFallbackGroups() {
  const results = await Promise.allSettled(
    CELESTRAK_FALLBACK_GROUPS.map((group) =>
      fetchJson(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=json`, { timeoutMs: 18000 })
    )
  );
  const byNorad = new Map();
  for (const result of results) {
    if (result.status !== "fulfilled" || !Array.isArray(result.value)) continue;
    for (const record of result.value) {
      const key = String(record.NORAD_CAT_ID || record.OBJECT_ID || record.OBJECT_NAME || "");
      if (key && !byNorad.has(key)) byNorad.set(key, record);
    }
  }
  if (!byNorad.size) return fetchJson(SOURCE_URLS.celestrakVisual, { timeoutMs: 15000 });
  return [...byNorad.values()];
}

function deriveSatellite(record, now) {
  const noradId = String(record.NORAD_CAT_ID || record.OBJECT_ID || record.OBJECT_NAME || "");
  const meanMotion = Number(record.MEAN_MOTION) || 14.2;
  const inclination = Number(record.INCLINATION) || 0;
  const raan = Number(record.RA_OF_ASC_NODE) || 0;
  const argPerigee = Number(record.ARG_OF_PERICENTER) || 0;
  const meanAnomaly = Number(record.MEAN_ANOMALY) || 0;
  const epochMs = Date.parse(record.EPOCH || "") || now;
  const elapsedMinutes = (now - epochMs) / 60000;
  const periodMinutes = 1440 / meanMotion;
  const angle = radians(meanAnomaly + (elapsedMinutes / periodMinutes) * 360);
  const point = orbitalPoint(angle, radians(inclination), radians(raan), radians(argPerigee), now);
  const altitudeKm = altitudeFromMeanMotion(meanMotion);
  const orbit = [];

  for (let step = 0; step < 32; step += 1) {
    const orbitAngle = angle + (step / 31) * Math.PI * 2;
    orbit.push(orbitalPoint(orbitAngle, radians(inclination), radians(raan), radians(argPerigee), now));
  }

  const objectType = classifySatellite(record, altitudeKm);
  return {
    id: `sat-${noradId}`,
    noradId,
    type: "satellite",
    name: record.OBJECT_NAME || `NORAD ${noradId}`,
    objectType,
    lat: point.lat,
    lng: point.lng,
    altitudeKm,
    inclination,
    periodMinutes,
    source: "CelesTrak GP",
    displayColor: satelliteColor(objectType),
    orbit,
  };
}

function orbitalPoint(angle, inclination, raan, argPerigee, now) {
  const u = angle + argPerigee;
  const xOrb = Math.cos(u);
  const yOrb = Math.sin(u);
  const x1 = xOrb * Math.cos(raan) - yOrb * Math.cos(inclination) * Math.sin(raan);
  const y1 = xOrb * Math.sin(raan) + yOrb * Math.cos(inclination) * Math.cos(raan);
  const z1 = yOrb * Math.sin(inclination);
  const earthRotation = ((now / 1000) % 86164) / 86164 * Math.PI * 2;
  const x = x1 * Math.cos(earthRotation) + y1 * Math.sin(earthRotation);
  const y = -x1 * Math.sin(earthRotation) + y1 * Math.cos(earthRotation);
  const z = z1;
  return {
    lat: degrees(Math.asin(z)),
    lng: normalizeLng(degrees(Math.atan2(y, x))),
  };
}

function altitudeFromMeanMotion(meanMotion) {
  const mu = 398600.4418;
  const earthRadiusKm = 6378.137;
  const n = (meanMotion * Math.PI * 2) / 86400;
  const semiMajorAxis = Math.cbrt(mu / (n * n));
  return Math.max(160, semiMajorAxis - earthRadiusKm);
}

function classifySatellite(record, altitudeKm) {
  const name = String(record.OBJECT_NAME || "").toLowerCase();
  if (name.includes("starlink")) return "Starlink";
  if (name.includes("gps") || name.includes("glonass") || name.includes("galileo") || name.includes("beidou")) return "Navigation";
  if (altitudeKm > 30000) return "GEO";
  if (altitudeKm > 2000) return "MEO";
  return "LEO";
}

function satelliteColor(objectType) {
  return {
    Starlink: "#8bd8ff",
    Navigation: "#23f7b5",
    GEO: "#ffcc4d",
    MEO: "#c678ff",
    LEO: "#b85cff",
  }[objectType] || "#b85cff";
}

async function fetchFlights(scope) {
  const bounds = SCOPE_BOUNDS[scope] || SCOPE_BOUNDS.world;
  const url = new URL(SOURCE_URLS.openskyAll);
  if (scope !== "world") {
    url.searchParams.set("lamin", bounds.lamin);
    url.searchParams.set("lamax", bounds.lamax);
    url.searchParams.set("lomin", bounds.lomin);
    url.searchParams.set("lomax", bounds.lomax);
  }

  const headers = {};
  const openskyToken = getConfiguredSecret("openskyToken", ["OPENSKY_TOKEN"]);
  if (openskyToken) headers.Authorization = `Bearer ${openskyToken}`;

  let data;
  try {
    data = await fetchJson(url.href, { headers, timeoutMs: 10000 });
  } catch (error) {
    if (!/429|Too many requests/i.test(error.message)) throw error;
    return fetchAdsbLolFlights(scope);
  }
  const states = Array.isArray(data.states) ? data.states : [];
  const maxStates = scope === "world" ? 5000 : scope === "us" ? 2200 : 900;
  return deterministicSample(states, maxStates, (state) => state[0])
    .map((stateVector) => {
      const lng = Number(stateVector[5]);
      const lat = Number(stateVector[6]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const callsign = String(stateVector[1] || "").trim() || stateVector[0];
      return {
        id: `flight-${stateVector[0]}`,
        icao24: stateVector[0],
        type: "flight",
        name: callsign,
        callsign,
        country: stateVector[2] || "Unknown",
        lat,
        lng,
        altitudeMeters: Number(stateVector[13] || stateVector[7] || 0),
        velocity: Number(stateVector[9] || 0),
        heading: Number(stateVector[10] || 0),
        onGround: Boolean(stateVector[8]),
        time: stateVector[4] ? new Date(stateVector[4] * 1000).toISOString() : new Date().toISOString(),
        source: "OpenSky",
      };
    })
    .filter(Boolean);
}

async function fetchAdsbLolFlights(scope) {
  const points = flightFallbackPoints(scope);
  const results = await Promise.allSettled(
    points.map((point) =>
      fetchJson(`${SOURCE_URLS.adsbLolPoint}/${point.lat}/${point.lng}/${point.radius}`, {
        timeoutMs: 12000,
        headers: { Accept: "application/json" },
      })
    )
  );
  const byHex = new Map();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const aircraft of result.value.ac || []) {
      const mapped = mapAdsbLolAircraft(aircraft);
      if (mapped && !byHex.has(mapped.icao24)) byHex.set(mapped.icao24, mapped);
    }
  }
  if (!byHex.size) throw new Error("OpenSky rate-limited and ADS-B fallback returned no aircraft");
  const max = scope === "world" ? 1800 : scope === "us" ? 1200 : 600;
  return deterministicSample([...byHex.values()], max, (flight) => flight.icao24);
}

function flightFallbackPoints(scope) {
  if (scope === "us") {
    return [
      { lat: 39, lng: -98, radius: 250 },
      { lat: 34, lng: -118, radius: 250 },
      { lat: 40.7, lng: -74, radius: 250 },
      { lat: 33.7, lng: -84.4, radius: 250 },
      { lat: 41.9, lng: -87.6, radius: 250 },
      { lat: 47.6, lng: -122.3, radius: 250 },
    ];
  }
  if (scope === "west" || scope === "oregon") {
    return [
      { lat: 45.5, lng: -122.7, radius: 250 },
      { lat: 37.6, lng: -122.4, radius: 250 },
      { lat: 34, lng: -118, radius: 250 },
      { lat: 40.8, lng: -111.9, radius: 250 },
    ];
  }
  return [
    { lat: 39, lng: -98, radius: 250 },
    { lat: 34, lng: -118, radius: 250 },
    { lat: 40.7, lng: -74, radius: 250 },
    { lat: 52, lng: 13, radius: 250 },
    { lat: 51.5, lng: -0.1, radius: 250 },
    { lat: 25.2, lng: 55.3, radius: 250 },
    { lat: 35.7, lng: 139.7, radius: 250 },
    { lat: -33.9, lng: 151.2, radius: 250 },
  ];
}

function mapAdsbLolAircraft(aircraft) {
  const lat = Number(aircraft.lat);
  const lng = Number(aircraft.lon);
  const icao24 = String(aircraft.hex || "").trim();
  if (!icao24 || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const callsign = cleanCameraText(aircraft.flight || aircraft.r || icao24);
  const altitudeFeet = Number(aircraft.alt_geom || aircraft.alt_baro || 0);
  const altitudeMeters = Number.isFinite(altitudeFeet) ? altitudeFeet * 0.3048 : 0;
  const groundspeedKnots = Number(aircraft.gs || 0);
  return {
    id: `flight-${icao24}`,
    icao24,
    type: "flight",
    name: callsign,
    callsign,
    registration: cleanCameraText(aircraft.r || ""),
    aircraftType: cleanCameraText(aircraft.t || ""),
    country: "ADS-B",
    lat,
    lng,
    altitudeMeters,
    velocity: Number.isFinite(groundspeedKnots) ? groundspeedKnots * 0.514444 : 0,
    heading: Number(aircraft.track ?? aircraft.true_heading ?? aircraft.mag_heading ?? 0),
    onGround: String(aircraft.alt_baro).toLowerCase() === "ground",
    time: new Date(Date.now() - Math.max(0, Number(aircraft.seen_pos || aircraft.seen || 0)) * 1000).toISOString(),
    source: "ADSB.lol",
  };
}

async function fetchCensusDemographics() {
  const url = new URL(SOURCE_URLS.censusAcsStatePopulation);
  url.searchParams.set("get", "NAME,B01003_001E");
  url.searchParams.set("for", "state:*");
  const censusApiKey = getConfiguredSecret("censusApiKey", ["CENSUS_API_KEY"]);
  if (censusApiKey) url.searchParams.set("key", censusApiKey);

  const rows = await fetchJson(url.toString(), { timeoutMs: 12000 });
  const [header, ...records] = Array.isArray(rows) ? rows : [];
  if (!Array.isArray(header)) throw new Error("Census API returned an unexpected shape");
  const nameIndex = header.indexOf("NAME");
  const populationIndex = header.indexOf("B01003_001E");
  const stateIndex = header.indexOf("state");

  return records
    .map((row) => {
      const fips = String(row[stateIndex] || "").padStart(2, "0");
      const centroid = CENSUS_STATE_CENTROIDS[fips];
      const population = Number(row[populationIndex]);
      if (!centroid || !Number.isFinite(population)) return null;
      return {
        id: `census-state-${fips}`,
        type: "demographic",
        name: row[nameIndex],
        title: `${row[nameIndex]} population`,
        area: centroid.code,
        region: "United States",
        lat: centroid.lat,
        lng: centroid.lng,
        population,
        populationLabel: population.toLocaleString("en-US"),
        source: "U.S. Census ACS 2023 5-year",
        sourceUrl: "https://www.census.gov/programs-surveys/acs",
        dataset: "B01003 total population",
        displayColor: "#39d98a",
        radiusKm: populationToRadius(population),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.population - left.population);
}

function populationToRadius(population) {
  return clamp(Math.sqrt(Number(population) || 0) / 95, 45, 460);
}

async function fetchQuakes() {
  const [allDay, significant] = await Promise.all([
    fetchJson(SOURCE_URLS.usgsQuakes, { timeoutMs: 10000 }),
    fetchJson(SOURCE_URLS.usgsSignificantQuakes, { timeoutMs: 10000 }).catch(() => ({ features: [] })),
  ]);
  const featuresById = new Map();
  for (const feature of [...(allDay.features || []), ...(significant.features || [])]) {
    featuresById.set(feature.id || feature.properties?.code || JSON.stringify(feature.geometry?.coordinates), feature);
  }
  const quakes = [...featuresById.values()]
    .map((feature) => {
      const [lng, lat, depthKm] = feature.geometry?.coordinates || [];
      const magnitude = Number(feature.properties?.mag || 0);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        id: `quake-${feature.id}`,
        type: "quake",
        name: feature.properties?.title || `M${magnitude} earthquake`,
        title: feature.properties?.title || `M${magnitude} earthquake`,
        lat,
        lng,
        depthKm: Number(depthKm || 0),
        magnitude,
        location: feature.properties?.place || "USGS event",
        severity: quakeSeverity(magnitude),
        displayColor: quakeColor(magnitude),
        time: feature.properties?.time ? new Date(feature.properties.time).toISOString() : new Date().toISOString(),
        source: "USGS",
        detailUrl: feature.properties?.detail || "",
        url: feature.properties?.url,
      };
    })
    .filter(Boolean)
    .sort((left, right) => (right.magnitude || 0) - (left.magnitude || 0));
  await enrichQuakesWithShakeMap(quakes.filter((quake) => quake.magnitude >= 4).slice(0, 12));
  return quakes;
}

async function enrichQuakesWithShakeMap(quakes) {
  await Promise.allSettled(quakes.map(async (quake) => {
    if (!quake.detailUrl) return;
    const detail = await fetchJson(quake.detailUrl, { timeoutMs: 7000 });
    const products = detail.properties?.products?.shakemap || [];
    const product = products[0];
    if (!product) return;
    const props = product.properties || {};
    const contents = product.contents || {};
    const overlay = contents["download/intensity_overlay.png"]?.url || "";
    const intensityMap = contents["download/intensity.jpg"]?.url || contents["download/intensity.pdf"]?.url || "";
    const bounds = {
      west: Number(props["minimum-longitude"]),
      south: Number(props["minimum-latitude"]),
      east: Number(props["maximum-longitude"]),
      north: Number(props["maximum-latitude"]),
    };
    quake.shakeMap = {
      overlay,
      intensityMap,
      maxMmi: Number(props.maxmmi || props["maxmmi-grid"] || 0),
      status: props["map-status"] || props["review-status"] || "available",
      version: props.version || "",
      bounds,
      url: product.contents?.["download/intensity.jpg"]?.url || quake.url,
    };
    if ([bounds.west, bounds.south, bounds.east, bounds.north].every(Number.isFinite)) {
      quake.geometryRings = [[
        { lat: bounds.south, lng: bounds.west },
        { lat: bounds.south, lng: bounds.east },
        { lat: bounds.north, lng: bounds.east },
        { lat: bounds.north, lng: bounds.west },
        { lat: bounds.south, lng: bounds.west },
      ]];
      quake.radiusKm = Math.max(80, Math.min(700, distanceBetweenLatLng(bounds.south, bounds.west, bounds.north, bounds.east) / 2));
    }
  }));
}

async function fetchFires(scope) {
  const mapKey = nasaFirmsMapKey();
  if (!mapKey) throw new Error("NASA FIRMS map key is not configured");

  const bounds = SCOPE_BOUNDS[scope] || SCOPE_BOUNDS.world;
  const area = scope === "world"
    ? "world"
    : [bounds.lomin, bounds.lamin, bounds.lomax, bounds.lamax].map((value) => Number(value).toFixed(3)).join(",");
  const url = `${SOURCE_URLS.nasaFirmsArea}/${encodeURIComponent(mapKey)}/VIIRS_SNPP_NRT/${area}/1`;
  const csv = await fetchText(url, { timeoutMs: 14000, accept: "text/csv, text/plain;q=0.9, */*;q=0.5" });
  return parseFirmsCsv(csv)
    .map((row, index) => mapFirmsRow(row, index))
    .filter(Boolean)
    .sort((left, right) => (right.frp || 0) - (left.frp || 0));
}

function nasaFirmsMapKey() {
  return getConfiguredSecret("nasaFirmsMapKey", ["NASA_FIRMS_MAP_KEY", "FIRMS_MAP_KEY"]);
}

function parseFirmsCsv(csv) {
  const lines = String(csv || "").trim().split(/\r?\n/).filter(Boolean);
  const headers = (lines.shift() || "").split(",").map((header) => header.trim());
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function mapFirmsRow(row, index) {
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const frp = Number(row.frp || 0);
  const brightness = Number(row.bright_ti4 || row.brightness || 0);
  const confidence = String(row.confidence || "").toLowerCase();
  const time = firmsTimestamp(row.acq_date, row.acq_time);
  const confidenceLabel = { l: "low", n: "nominal", h: "high" }[confidence] || confidence || "unknown";
  return {
    id: `fire-${row.acq_date || "date"}-${row.acq_time || "time"}-${lat.toFixed(4)}-${lng.toFixed(4)}-${index}`,
    type: "fire",
    name: `Fire hotspot ${confidenceLabel}`,
    title: `NASA FIRMS hotspot (${confidenceLabel})`,
    lat,
    lng,
    frp,
    brightness,
    confidence: confidenceLabel,
    satellite: row.satellite || "",
    instrument: row.instrument || "VIIRS",
    daynight: row.daynight || "",
    severity: fireSeverity(frp, confidenceLabel),
    displayColor: fireColor(frp, confidenceLabel),
    time,
    source: "NASA FIRMS",
    url: "https://firms.modaps.eosdis.nasa.gov/map/",
  };
}

function firmsTimestamp(date, time) {
  const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? date : new Date().toISOString().slice(0, 10);
  const padded = String(time || "0").padStart(4, "0").slice(0, 4);
  return new Date(`${cleanDate}T${padded.slice(0, 2)}:${padded.slice(2, 4)}:00Z`).toISOString();
}

async function fetchEgpIncidents() {
  const url = new URL(SOURCE_URLS.egpIncidents);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", "*");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("f", "geojson");
  url.searchParams.set("resultRecordCount", "1000");
  const data = await fetchJson(url.href, { timeoutMs: 12000 });
  return (data.features || []).map(mapEgpIncidentFeature).filter(Boolean);
}

async function fetchEgpPerimeters() {
  const url = new URL(SOURCE_URLS.egpPerimeters);
  url.searchParams.set("where", "poly_IsVisible='Yes'");
  url.searchParams.set("outFields", "*");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("f", "geojson");
  url.searchParams.set("resultRecordCount", "500");
  const data = await fetchJson(url.href, { timeoutMs: 16000 });
  return (data.features || []).map(mapEgpPerimeterFeature).filter(Boolean);
}

function mapEgpIncidentFeature(feature, index) {
  const props = feature.properties || {};
  const [lng, lat] = feature.geometry?.coordinates || [];
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  const acres = Number(props.DailyAcres || props.CalculatedAcres || props.IncidentSize || props.FinalAcres || 0);
  const contained = Number(props.PercentContained);
  const name = cleanCameraText(props.Name || props.IncidentName || props.UniqueFireIdentifier || "Active wildfire incident");
  return {
    id: `egp-incident-${props.IrwinID || props.UniqueFireIdentifier || props.OBJECTID || index}`,
    type: "fire",
    subtype: "incident",
    name,
    title: `WildFireSA incident: ${name}`,
    lat: Number(lat),
    lng: Number(lng),
    acres,
    frp: 0,
    confidence: Number.isFinite(contained) ? `${contained}% contained` : "incident",
    containment: Number.isFinite(contained) ? contained : null,
    county: props.County || props.POOCounty || "",
    state: stateNameFromCode(props.POOState),
    gacc: props.GACC || "",
    cause: cleanCameraText(props.Cause || props.FireCause || ""),
    personnel: Number(props.TotalIncidentPersonnel || 0),
    severity: acres >= 10000 || contained < 30 ? "critical" : acres >= 1000 ? "high" : acres >= 100 ? "medium" : "low",
    displayColor: acres >= 1000 ? "#ff4e57" : "#ff9f1c",
    time: parseArcgisDate(props.Sit209_Report_Date || props.Last_Time_Information_Modified || props.Discovery_Date || props.FireDiscoveryDateTime || props.CreatedOnDateTime_dt),
    source: "EGP WildFireSA",
    sourceUrl: "https://egp.wildfire.gov/maps/",
    url: "https://egp.wildfire.gov/maps/",
  };
}

function mapEgpPerimeterFeature(feature, index) {
  const props = feature.properties || {};
  const geometryRings = alertGeometryRings(feature.geometry);
  const center = centroidFromFeature(feature);
  if (!center || !geometryRings.length) return null;
  const acres = Number(props.poly_GISAcres || props.poly_Acres_AutoCalc || props.attr_FinalAcres || props.attr_IncidentSize || 0);
  const name = cleanCameraText(props.poly_IncidentName || props.attr_IncidentName || "Current fire perimeter");
  return {
    id: `egp-perimeter-${props.GlobalID || props.poly_SourceGlobalID || props.OBJECTID || index}`,
    type: "fire",
    subtype: "perimeter",
    name,
    title: `Current fire perimeter: ${name}`,
    lat: center.lat,
    lng: center.lng,
    acres,
    frp: 0,
    confidence: "perimeter",
    geometryRings,
    radiusKm: Math.max(30, Math.min(400, Math.sqrt(Math.max(acres, 1)) * 1.3)),
    county: props.attr_POOCounty || "",
    state: stateNameFromCode(props.attr_POOState),
    gacc: props.attr_GACC || "",
    cause: cleanCameraText(props.attr_FireCause || props.attr_FireCauseGeneral || ""),
    severity: acres >= 10000 ? "critical" : acres >= 1000 ? "high" : acres >= 100 ? "medium" : "low",
    displayColor: acres >= 1000 ? "#ff4e57" : "#ffb02e",
    time: parseArcgisDate(props.poly_DateCurrent || props.poly_PolygonDateTime || props.attr_ModifiedOnDateTime_dt),
    source: "WFIGS Current Perimeters",
    sourceUrl: "https://egp.wildfire.gov/maps/",
    url: "https://egp.wildfire.gov/maps/",
  };
}

function parseArcgisDate(value) {
  if (Number.isFinite(Number(value))) return new Date(Number(value)).toISOString();
  const text = cleanCameraText(value);
  if (!text) return new Date().toISOString();
  const normalized = text.replace(/(\d{2}):(\d{2})(\d{2})\sUTC$/i, "$1:$2:$3Z").replace(/\sUTC$/i, "Z").replace(" ", "T");
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function stateNameFromCode(value) {
  return cleanCameraText(value).replace(/^US-/, "");
}

async function fetchAlerts(scope) {
  if (scope === "world" || scope === "us") {
    const data = await fetchJson(SOURCE_URLS.nwsAlerts, { timeoutMs: 12000 });
    return mapNwsAlertFeatures(data.features || [], "US").slice(0, 180);
  }

  const areas = scope === "oregon" ? ["OR"] : scope === "west" ? ["OR", "WA", "CA", "ID", "NV"] : ["OR", "WA", "CA", "ID", "NV", "AK", "HI"];
  const results = await Promise.allSettled(
    areas.map((area) => fetchJson(`${SOURCE_URLS.nwsAlerts}?area=${encodeURIComponent(area)}`, { timeoutMs: 9000 }))
  );

  return results
    .flatMap((result, areaIndex) => {
      if (result.status !== "fulfilled") return [];
      return mapNwsAlertFeatures(result.value.features || [], areas[areaIndex]);
    })
    .slice(0, 140);
}

function mapNwsAlertFeatures(features, area) {
  return features.map((feature, index) => {
    const props = feature.properties || {};
    const alertArea = stateCodeFromAlert(props) || area;
    const geometryRings = alertGeometryRings(feature.geometry);
    const center = centroidFromFeature(feature) || fallbackAlertCenter(alertArea, index);
    return {
      id: `alert-${props.id || feature.id || area + index}`,
      type: "alert",
      name: props.headline || props.event || "Weather alert",
      title: props.headline || props.event || "Weather alert",
      event: props.event || "Alert",
      lat: center.lat,
      lng: center.lng,
      region: props.areaDesc || area,
      areaSummary: summarizeAlertArea(props.areaDesc || area),
      area: alertArea,
      stateCode: alertArea,
      geometryRings,
      radiusKm: geometryRings.length ? 0 : fallbackAlertRadiusKm(alertArea, props.areaDesc || ""),
      severity: props.severity || "Unknown",
      urgency: props.urgency || "Unknown",
      certainty: props.certainty || "Unknown",
      time: props.sent || props.effective || new Date().toISOString(),
      expires: props.expires || props.ends || "",
      instruction: props.instruction || props.description || "",
      source: "NWS",
      url: props["@id"] || props.id,
    };
  });
}

async function fetchNhcStormAlerts() {
  const data = await fetchJson(SOURCE_URLS.nhcCurrentStorms, { timeoutMs: 9000 });
  const storms = Array.isArray(data.activeStorms) ? data.activeStorms : [];
  return storms
    .map((storm, index) => {
      const lat = Number(storm.lat || storm.latitude || storm.centerLat || storm.currentLat);
      const lng = Number(storm.lon || storm.lng || storm.longitude || storm.centerLon || storm.centerLng || storm.currentLon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const name = storm.name || storm.stormName || storm.binNumber || `Tropical system ${index + 1}`;
      return {
        id: `nhc-${storm.id || storm.stormId || storm.binNumber || slugify(name)}`,
        type: "alert",
        name: `${name} tropical weather`,
        title: `${name} tropical weather`,
        event: storm.classification || storm.type || "NHC tropical weather",
        lat,
        lng,
        region: storm.basin || "Atlantic/Caribbean",
        areaSummary: "National Hurricane Center active storm",
        area: "NHC",
        severity: storm.intensity || storm.classification || "Tropical",
        urgency: "Monitor",
        certainty: "Observed",
        radiusKm: 320,
        time: storm.lastUpdate || storm.publicAdvisoryTime || new Date().toISOString(),
        instruction: "Open the NHC advisory for official forecast details.",
        source: "NHC",
        url: storm.publicAdvisory?.url || storm.forecastTrack?.url || "https://www.nhc.noaa.gov/",
      };
    })
    .filter(Boolean);
}

async function fetchCubaOpenReports() {
  const url = new URL(SOURCE_URLS.gdeltCubaDocs);
  url.searchParams.set("query", '(Cuba OR Havana OR Varadero OR "Florida Straits")');
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("timespan", "24h");
  url.searchParams.set("maxrecords", "8");
  url.searchParams.set("sort", "datedesc");
  const data = await fetchJson(url.toString(), { timeoutMs: 12000 });
  const articles = Array.isArray(data.articles) ? data.articles : [];
  return articles.map((article, index) => {
    const title = cleanCameraText(article.title || "Cuba public report");
    return {
      id: `cuba-report-${hashKey(article.url || title || index)}`,
      type: "alert",
      name: title,
      title,
      event: "Open reporting",
      lat: 23.1136 + (index % 3) * 0.08,
      lng: -82.3666 + (index % 4) * 0.08,
      region: "Cuba",
      areaSummary: article.domain || "GDELT public reporting",
      area: "CU",
      severity: "Open Source",
      urgency: "Monitor",
      certainty: "Reported",
      radiusKm: 65,
      time: parseGdeltDate(article.seendate) || new Date().toISOString(),
      instruction: "Public media signal from GDELT. Treat as reporting context, not official confirmation.",
      source: "GDELT",
      url: article.url || "",
    };
  });
}

function parseGdeltDate(value) {
  const text = String(value || "");
  const match = text.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})?Z?$/);
  if (!match) return "";
  const [, year, month, day, hour, minute, second = "00"] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString();
}

function buildCubaReferenceSignals() {
  const now = new Date().toISOString();
  return [
    {
      id: "cuba-ref-ioda-internet",
      type: "alert",
      name: "Cuba internet outage monitor",
      title: "Cuba internet outage monitor",
      event: "Reference monitor",
      lat: 23.1136,
      lng: -82.3666,
      region: "Cuba",
      areaSummary: "IODA Internet outage dashboard",
      area: "CU",
      severity: "Reference",
      urgency: "Monitor",
      certainty: "Dashboard",
      radiusKm: 80,
      time: now,
      instruction: "Open IODA for country-level Internet outage and routing signal context.",
      source: "IODA",
      url: "https://ioda.inetintel.cc.gatech.edu/country/CU",
    },
    {
      id: "cuba-ref-nhc-caribbean",
      type: "alert",
      name: "Caribbean tropical weather monitor",
      title: "Caribbean tropical weather monitor",
      event: "Reference monitor",
      lat: 21.8,
      lng: -80.0,
      region: "Cuba / Caribbean",
      areaSummary: "NHC tropical weather products",
      area: "CU",
      severity: "Reference",
      urgency: "Monitor",
      certainty: "Dashboard",
      radiusKm: 160,
      time: now,
      instruction: "Open NHC for official tropical cyclone outlooks, cones, and advisories.",
      source: "NHC",
      url: "https://www.nhc.noaa.gov/",
    },
    {
      id: "cuba-ref-state-advisory",
      type: "alert",
      name: "Cuba travel advisory reference",
      title: "Cuba travel advisory reference",
      event: "Reference monitor",
      lat: 23.1136,
      lng: -82.3666,
      region: "Cuba",
      areaSummary: "U.S. State Department country advisory",
      area: "CU",
      severity: "Reference",
      urgency: "Monitor",
      certainty: "Dashboard",
      radiusKm: 55,
      time: now,
      instruction: "Open the official travel advisory page for current public State Department guidance.",
      source: "U.S. State Department",
      url: "https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/cuba-travel-advisory.html",
    },
  ];
}

function alertGeometryRings(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  const rawRings = [];
  if (geometry.type === "Polygon") {
    rawRings.push(...geometry.coordinates);
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) rawRings.push(...polygon);
  }
  return rawRings
    .map((ring) => simplifyRing(ring))
    .filter((ring) => ring.length >= 3)
    .slice(0, 10);
}

function simplifyRing(ring) {
  if (!Array.isArray(ring)) return [];
  const step = Math.max(1, Math.ceil(ring.length / 160));
  const simplified = [];
  for (let index = 0; index < ring.length; index += step) {
    const point = ring[index];
    if (Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))) {
      simplified.push({ lat: Number(point[1]), lng: Number(point[0]) });
    }
  }
  const first = simplified[0];
  const last = simplified[simplified.length - 1];
  if (first && last && (first.lat !== last.lat || first.lng !== last.lng)) simplified.push(first);
  return simplified;
}

function stateCodeFromAlert(props) {
  const ugc = props?.geocode?.UGC;
  if (Array.isArray(ugc) && ugc.length) {
    const code = String(ugc[0] || "").slice(0, 2).toUpperCase();
    if (STATE_CENTERS[code]) return code;
  }
  const sender = String(props.senderName || props.sender || props.headline || "");
  const match = sender.match(/\b([A-Z]{2})\b\s*$/);
  return match && STATE_CENTERS[match[1]] ? match[1] : "";
}

function summarizeAlertArea(areaDesc) {
  const text = cleanCameraText(areaDesc || "");
  if (!text) return "Unknown area";
  const parts = text.split(";").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 2) return text;
  return `${parts.slice(0, 2).join("; ")} +${parts.length - 2} more`;
}

function centroidFromFeature(feature) {
  const geometry = feature.geometry;
  if (!geometry) return null;
  const points = [];
  collectCoordinates(geometry.coordinates, points);
  if (!points.length) return null;
  const lat = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const lng = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  return { lat, lng };
}

function collectCoordinates(value, points) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    points.push(value);
    return;
  }
  value.forEach((item) => collectCoordinates(item, points));
}

function fallbackAlertCenter(area, index) {
  const centers = {
    ...STATE_CENTERS,
    US: [39.5, -98.35],
  };
  const [lat, lng] = centers[area] || [44, -120];
  return { lat: lat + (index % 5) * 0.08, lng: lng + (index % 7) * 0.08 };
}

function fallbackAlertRadiusKm(area, areaDesc) {
  const parts = String(areaDesc || "").split(";").filter((part) => part.trim()).length;
  if (area === "US") return 850;
  return Math.min(720, Math.max(120, 140 + parts * 24));
}

const STATE_CENTERS = {
  AL: [32.8, -86.8], AK: [64.2, -149.5], AZ: [34.2, -111.7], AR: [34.9, -92.4],
  CA: [37.2, -119.5], CO: [39.0, -105.5], CT: [41.6, -72.7], DE: [39.0, -75.5],
  FL: [28.6, -82.4], GA: [32.7, -83.3], HI: [20.8, -156.3], IA: [42.1, -93.5],
  ID: [44.1, -114.6], IL: [40.0, -89.2], IN: [39.9, -86.3], KS: [38.5, -98.0],
  KY: [37.8, -85.8], LA: [31.0, -91.9], MA: [42.3, -71.8], MD: [39.0, -76.7],
  ME: [45.3, -69.0], MI: [44.3, -85.4], MN: [46.3, -94.2], MO: [38.5, -92.5],
  MS: [32.7, -89.7], MT: [47.0, -110.5], NC: [35.5, -79.4], ND: [47.5, -100.5],
  NE: [41.5, -99.8], NH: [43.7, -71.6], NJ: [40.1, -74.7], NM: [34.4, -106.1],
  NV: [39.3, -116.6], NY: [42.9, -75.0], OH: [40.4, -82.8], OK: [35.6, -97.5],
  OR: [44.05, -120.55], PA: [41.0, -77.7], RI: [41.7, -71.6], SC: [33.8, -80.9],
  SD: [44.4, -100.2], TN: [35.8, -86.4], TX: [31.0, -99.3], UT: [39.3, -111.7],
  VA: [37.5, -78.8], VT: [44.0, -72.7], WA: [47.4, -120.7], WI: [44.6, -89.6],
  WV: [38.6, -80.6], WY: [43.0, -107.6], DC: [38.9, -77.0],
};

function buildEvents({ cameras, satellites, flights, quakes, alerts, fires }) {
  const now = Date.now();
  const cameraEvents = cameras
    .filter((camera) => camera.capability === "player")
    .slice(0, 4)
    .map((camera, index) => ({
      id: camera.id,
      type: "camera",
      title: `${camera.shortName || camera.name} live player available`,
      region: camera.area,
      time: new Date(now - index * 7 * 60000).toISOString(),
      severity: "Live Feed",
    }));

  const quakeEvents = quakes.slice(0, 4).map((quake) => ({
    id: quake.id,
    type: "quake",
    title: quake.title,
    region: quake.location,
    time: quake.time,
    severity: quake.severity,
  }));

  const actionableAlerts = sortAlertsForDisplay(alerts).filter(isActionableAlert);
  const alertEvents = (actionableAlerts.length ? actionableAlerts : sortAlertsForDisplay(alerts)).slice(0, 10).map((alert) => ({
    id: alert.id,
    type: "alert",
    title: alert.title,
    region: alert.region,
    areaSummary: alert.areaSummary,
    event: alert.event,
    time: alert.time,
    severity: alert.severity,
  }));

  const flightEvents = flights.slice(0, 3).map((flight, index) => ({
    id: flight.id,
    type: "flight",
    title: `${flight.callsign || "Aircraft"} tracked`,
    region: flight.country,
    time: flight.time || new Date(now - index * 9 * 60000).toISOString(),
    severity: "Aircraft",
  }));

  const satEvents = satellites.slice(0, 3).map((satellite, index) => ({
    id: satellite.id,
    type: "satellite",
    title: `${satellite.name} pass projected`,
    region: satellite.objectType,
    time: new Date(now - index * 11 * 60000).toISOString(),
    severity: "Orbit",
  }));

  const fireEvents = fires.slice(0, 5).map((fire) => ({
    id: fire.id,
    type: "fire",
    title: fire.title,
    region: `${fire.instrument || "VIIRS"} | FRP ${Math.round(fire.frp || 0)}`,
    time: fire.time,
    severity: fire.severity,
  }));

  const priority = { alert: 0, fire: 1, quake: 2, flight: 3, satellite: 4, camera: 5 };
  return [...alertEvents, ...fireEvents, ...quakeEvents, ...flightEvents, ...satEvents, ...cameraEvents]
    .sort((left, right) => (priority[left.type] ?? 9) - (priority[right.type] ?? 9) || Date.parse(right.time || 0) - Date.parse(left.time || 0))
    .slice(0, 24);
}

function sortAlertsForDisplay(alerts = []) {
  return [...alerts].sort((left, right) => {
    const leftTier = alertDisplayTier(left);
    const rightTier = alertDisplayTier(right);
    if (leftTier !== rightTier) return leftTier - rightTier;
    const leftTime = Date.parse(left.time || left.updated || left.effective || "") || 0;
    const rightTime = Date.parse(right.time || right.updated || right.effective || "") || 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return alertPriority(right) - alertPriority(left);
  });
}

function isActionableAlert(alert = {}) {
  return alertDisplayTier(alert) < 2;
}

function alertDisplayTier(alert = {}) {
  const text = `${alert.event || ""} ${alert.title || ""} ${alert.severity || ""} ${alert.source || ""}`;
  if (/test message/i.test(text) || isReferenceAlert(alert)) return 2;
  if (/open reporting|open source|gdelt/i.test(text)) return 1;
  return 0;
}

function isReferenceAlert(alert = {}) {
  return /reference/i.test(`${alert.event || ""} ${alert.severity || ""}`) || /reference monitor/i.test(alert.id || "");
}

function alertPriority(alert = {}) {
  const label = String(alert.severity || "").toLowerCase();
  if (/extreme|critical/.test(label)) return 5;
  if (/severe|high/.test(label)) return 4;
  if (/moderate|medium/.test(label)) return 3;
  if (/minor|low/.test(label)) return 2;
  return 1;
}

function buildRegions({ cameras, satellites, flights, quakes, alerts, fires }) {
  const buckets = new Map();
  for (const camera of cameras) addRegion(buckets, camera.region || camera.area, 1);
  for (const satellite of satellites) addRegion(buckets, satellite.objectType || "Orbit", 1);
  for (const flight of flights) addRegion(buckets, flight.country || "Aircraft", 1);
  for (const quake of quakes) addRegion(buckets, "Seismic", Math.max(1, Math.round(quake.magnitude || 1)));
  for (const alert of alerts) addRegion(buckets, alert.area || "Alerts", 2);
  for (const fire of fires) addRegion(buckets, "Fire Hotspots", Math.max(1, Math.ceil((fire.frp || 1) / 25)));

  return Array.from(buckets, ([name, total], index) => ({
    name,
    total,
    color: ["#19e2ff", "#b85cff", "#ffb02e", "#18f0a0", "#ff4e57", "#ff7a1a"][index % 6],
    delta: total > 20 ? "+ hot" : "+ live",
  }))
    .sort((left, right) => right.total - left.total)
    .slice(0, 12);
}

function addRegion(buckets, name, amount) {
  const key = name || "Unknown";
  buckets.set(key, (buckets.get(key) || 0) + amount);
}

function buildSeverity({ alerts, quakes, fires = [] }) {
  const severity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const quake of quakes) {
    if ((quake.magnitude || 0) >= 5) severity.critical += 1;
    else if ((quake.magnitude || 0) >= 4) severity.high += 1;
    else if ((quake.magnitude || 0) >= 2.5) severity.medium += 1;
    else severity.low += 1;
  }
  for (const alert of alerts) {
    const label = String(alert.severity || "").toLowerCase();
    if (label.includes("extreme") || label.includes("severe")) severity.critical += 1;
    else if (label.includes("moderate")) severity.high += 1;
    else if (label.includes("minor")) severity.medium += 1;
    else severity.low += 1;
  }
  for (const fire of fires) {
    if (fire.severity === "critical") severity.critical += 1;
    else if (fire.severity === "high") severity.high += 1;
    else if (fire.severity === "medium") severity.medium += 1;
    else severity.low += 1;
  }
  return severity;
}

function filterGeoItems(items, bounds) {
  if (!items?.length) return [];
  if (!bounds || bounds === SCOPE_BOUNDS.world) return items;
  return items.filter((item) => inBounds(item, bounds));
}

function quakeSeverity(magnitude) {
  if (magnitude >= 5) return "critical";
  if (magnitude >= 4) return "high";
  if (magnitude >= 2.5) return "medium";
  return "low";
}

function quakeColor(magnitude) {
  if (magnitude >= 5) return "#ff4e57";
  if (magnitude >= 4) return "#ff7a1a";
  if (magnitude >= 2.5) return "#ffb02e";
  return "#19e2ff";
}

function fireSeverity(frp, confidence) {
  if (confidence === "high" || frp >= 100) return "critical";
  if (frp >= 40) return "high";
  if (frp >= 10 || confidence === "nominal") return "medium";
  return "low";
}

function fireColor(frp, confidence) {
  if (confidence === "high" || frp >= 100) return "#ff4e57";
  if (frp >= 40) return "#ff7a1a";
  if (frp >= 10 || confidence === "nominal") return "#ffb02e";
  return "#18f0a0";
}

function inBounds(item, bounds) {
  return (
    Number.isFinite(Number(item.lat)) &&
    Number.isFinite(Number(item.lng)) &&
    item.lat >= bounds.lamin &&
    item.lat <= bounds.lamax &&
    item.lng >= bounds.lomin &&
    item.lng <= bounds.lomax
  );
}

function distanceBetweenLatLng(latA, lngA, latB, lngB) {
  const radiusKm = 6371;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const dLat = toRad(latB) - toRad(latA);
  const dLng = toRad(lngB) - toRad(lngA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeScope(value) {
  return Object.prototype.hasOwnProperty.call(SCOPE_BOUNDS, value) ? value : "world";
}

async function getCached(key, ttlMs, builder, options = {}) {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return { ok: true, data: cached.data, cached: true, updatedAt: cached.updatedAt };
  }

  const persist = options.persist ?? !/^(embed|hls):/.test(key);
  try {
    const data = await builder();
    cache.set(key, { data, expiresAt: now + ttlMs, updatedAt: now });
    if (persist) writeRuntimeCache(key, data, now);
    return { ok: true, data, cached: false, updatedAt: now };
  } catch (error) {
    if (cached) {
      return { ok: true, data: cached.data, cached: true, stale: true, updatedAt: cached.updatedAt, message: `Using in-memory cache: ${error.message}` };
    }
    if (persist) {
      const diskCache = readRuntimeCache(key, options.staleTtlMs ?? 7 * 24 * 60 * 60 * 1000);
      if (diskCache) {
        cache.set(key, { data: diskCache.data, expiresAt: now + Math.min(ttlMs, 60 * 1000), updatedAt: diskCache.updatedAt });
        return {
          ok: true,
          data: diskCache.data,
          cached: true,
          stale: true,
          updatedAt: diskCache.updatedAt,
          message: `Using saved cache from ${new Date(diskCache.updatedAt).toLocaleString()}: ${error.message}`,
        };
      }
    }
    return { ok: false, data: [], cached: false, message: error.message };
  }
}

function runtimeCachePath(key) {
  const digest = hashString(key).toString(36);
  return path.join(RUNTIME_CACHE_DIR, `${slugify(key)}-${digest}.json`);
}

function readRuntimeCache(key, maxAgeMs) {
  try {
    const filePath = runtimeCachePath(key);
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const updatedAt = Number(parsed.updatedAt || parsed.cachedAt || 0);
    if (!updatedAt || Date.now() - updatedAt > maxAgeMs) return null;
    return { data: parsed.data, updatedAt };
  } catch {
    return null;
  }
}

function writeRuntimeCache(key, data, updatedAt) {
  try {
    fs.mkdirSync(RUNTIME_CACHE_DIR, { recursive: true });
    fs.writeFileSync(runtimeCachePath(key), `${JSON.stringify({ updatedAt, data })}\n`);
  } catch {
    // Runtime cache is a resilience layer only; failed writes should never break live data.
  }
}

function healthFromResult(name, result, count, options = {}) {
  return {
    name,
    ok: result.ok,
    count,
    cached: result.cached,
    stale: result.stale || false,
    optional: Boolean(options.optional),
    message: result.message || "",
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "User-Agent": "Oversee/0.3 (+local public intelligence dashboard)",
      Accept: "application/geo+json, application/json, text/plain;q=0.9, */*;q=0.8",
      ...(options.headers || {}),
    },
    body: options.body,
    signal: AbortSignal.timeout(options.timeoutMs || 9000),
  });

  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  return response.json();
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "User-Agent": "Oversee/0.3 (+local public intelligence dashboard)",
      Accept: options.accept || "text/plain, */*;q=0.8",
      ...(options.headers || {}),
    },
    body: options.body,
    signal: AbortSignal.timeout(options.timeoutMs || 9000),
  });

  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  return response.text();
}

async function proxyGibsTexture(requestUrl, response) {
  const view = GIBS_TEXTURES[requestUrl.searchParams.get("view") || "nasa"] || GIBS_TEXTURES.nasa;
  const date = sanitizeIsoDate(requestUrl.searchParams.get("date")) || isoDateDaysAgo(2);
  const width = clampInt(requestUrl.searchParams.get("width"), 1024, 4096, view.width);
  const height = Math.round(width / 2);
  const gibsUrl = new URL(SOURCE_URLS.nasaGibsWms);
  gibsUrl.searchParams.set("SERVICE", "WMS");
  gibsUrl.searchParams.set("REQUEST", "GetMap");
  gibsUrl.searchParams.set("VERSION", "1.1.1");
  gibsUrl.searchParams.set("LAYERS", view.layer);
  gibsUrl.searchParams.set("STYLES", "");
  gibsUrl.searchParams.set("SRS", "EPSG:4326");
  gibsUrl.searchParams.set("BBOX", "-180,-90,180,90");
  gibsUrl.searchParams.set("WIDTH", String(width));
  gibsUrl.searchParams.set("HEIGHT", String(height));
  gibsUrl.searchParams.set("FORMAT", view.format);
  gibsUrl.searchParams.set("TIME", date);

  const cacheKey = `gibs:${view.layer}:${date}:${width}`;
  const result = await getCached(cacheKey, 6 * 60 * 60 * 1000, async () => {
    const upstream = await fetch(gibsUrl, {
      headers: {
        "User-Agent": "Oversee/0.3 (+local public intelligence dashboard)",
        Accept: `${view.format}, image/*;q=0.9, */*;q=0.5`,
      },
      signal: AbortSignal.timeout(14000),
    });
    if (!upstream.ok) throw new Error(`NASA GIBS returned ${upstream.status}`);
    const contentType = upstream.headers.get("content-type") || view.format;
    if (!/^image\//i.test(contentType)) throw new Error(`NASA GIBS returned ${contentType}`);
    return {
      buffer: Buffer.from(await upstream.arrayBuffer()),
      contentType,
      date,
    };
  });

  if (!result.data?.buffer) {
    return sendText(response, 502, `NASA GIBS texture failed: ${result.message || "no image returned"}`);
  }

  response.writeHead(200, {
    "Content-Type": result.data.contentType || view.format,
    "Cache-Control": "public, max-age=21600",
    "Access-Control-Allow-Origin": "*",
    "X-Oversee-Imagery-Date": result.data.date || date,
    "X-Oversee-Imagery-Stale": result.stale ? "true" : "false",
  });
  response.end(result.data.buffer);
}

function sanitizeIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return "";
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time)) return "";
  return value;
}

function isoDateDaysAgo(days) {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function clampInt(value, min, max, fallback) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

async function proxyImage(imageUrl, response) {
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return sendJson(response, 400, { error: "Missing or unsupported image URL" });
  }

  try {
    const upstream = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Oversee/0.3 (+local public intelligence dashboard)",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) throw new Error(`Image upstream returned ${upstream.status}`);
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    if (!/^image\//i.test(contentType)) throw new Error(`Image upstream returned ${contentType}`);
    const buffer = Buffer.from(await upstream.arrayBuffer());
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    response.end(buffer);
  } catch (error) {
    sendText(response, 502, `Image proxy failed: ${error.message}`);
  }
}

function serveStatic(requestPath, response) {
  const safePath = requestPath === "/" ? "/index.html" : decodeURIComponent(requestPath);
  const filePath = path.resolve(ROOT, `.${safePath}`);
  const relativePath = path.relative(ROOT, filePath);
  const pathParts = relativePath.split(path.sep);
  const isContained = relativePath && !relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath);
  const isPublicFile = relativePath === "index.html" || relativePath.startsWith(`assets${path.sep}`);
  const hasHiddenSegment = pathParts.some((part) => part.startsWith("."));
  if (!isContained || !isPublicFile || hasHiddenSegment) return sendText(response, 403, "Forbidden");

  fs.readFile(filePath, (error, data) => {
    if (error) return sendText(response, 404, "Not found");
    const ext = path.extname(filePath).toLowerCase();
    const isCode = [".html", ".css", ".js"].includes(ext);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": isCode ? "no-cache" : "public, max-age=300",
    });
    response.end(data);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, text) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
  response.end(text);
}

function isSameOriginLocalRequest(request) {
  const origin = request.headers.origin;
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const hostname = originUrl.hostname.toLowerCase();
    const isLoopback = hostname === "127.0.0.1" || hostname === "localhost";
    return isLoopback && originUrl.host.toLowerCase() === String(request.headers.host || "").toLowerCase();
  } catch {
    return false;
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 32_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

const USER_SETTING_FIELDS = [
  { key: "nasaFirmsMapKey", label: "NASA FIRMS map key", env: ["NASA_FIRMS_MAP_KEY", "FIRMS_MAP_KEY"] },
  { key: "openskyToken", label: "OpenSky API token", env: ["OPENSKY_TOKEN"] },
  { key: "googleMapsApiKey", label: "Google Maps / 3D Tiles key", env: ["GOOGLE_MAPS_API_KEY", "GOOGLE_EARTH_API_KEY"] },
  { key: "flightradar24ApiKey", label: "Flightradar24 API key", env: ["FLIGHTRADAR24_API_KEY", "FR24_API_KEY"] },
  { key: "cesiumIonToken", label: "Cesium ion token", env: ["CESIUM_ION_TOKEN"] },
  { key: "openAqApiKey", label: "OpenAQ API key", env: ["OPENAQ_API_KEY"] },
  { key: "censusApiKey", label: "Census API key", env: ["CENSUS_API_KEY"] },
  { key: "wisconsin511ApiKey", label: "Wisconsin 511 API key", env: ["WISCONSIN_511_API_KEY", "WI511_API_KEY"] },
  { key: "louisiana511ApiKey", label: "Louisiana 511 API key", env: ["LOUISIANA_511_API_KEY", "LA511_API_KEY"] },
  { key: "driveNcApiKey", label: "DriveNC API key", env: ["DRIVENC_API_KEY", "NC511_API_KEY"] },
  { key: "nswTransportApiKey", label: "Transport for NSW API key", env: ["NSW_TRANSPORT_API_KEY", "TRANSPORT_NSW_API_KEY"] },
];

function publicSettings() {
  return {
    updatedAt: USER_CONFIG.updatedAt || "",
    settings: USER_SETTING_FIELDS.map((field) => ({
      key: field.key,
      label: field.label,
      configured: Boolean(getConfiguredSecret(field.key, field.env)),
      local: Boolean(USER_CONFIG[field.key]),
      bundled: Boolean(BUNDLED_CONFIG[field.key]),
      env: field.env.some((name) => Boolean(process.env[name])),
    })),
  };
}

function updateLocalSettings(payload = {}) {
  for (const field of USER_SETTING_FIELDS) {
    const value = payload[field.key];
    const clear = payload[`${field.key}Clear`];
    if (clear) {
      delete USER_CONFIG[field.key];
      LOCAL_CONFIG[field.key] = BUNDLED_CONFIG[field.key] || "";
    } else if (typeof value === "string" && value.trim()) {
      USER_CONFIG[field.key] = value.trim();
      LOCAL_CONFIG[field.key] = value.trim();
    }
  }
  USER_CONFIG.updatedAt = new Date().toISOString();
  saveLocalConfig();
  cache.clear();
  return publicSettings();
}

function getConfiguredSecret(key, envNames = []) {
  for (const envName of envNames) {
    if (process.env[envName]) return process.env[envName];
  }
  return LOCAL_CONFIG[key] || "";
}

function saveLocalConfig() {
  const serializable = {};
  for (const field of USER_SETTING_FIELDS) {
    if (USER_CONFIG[field.key]) serializable[field.key] = USER_CONFIG[field.key];
  }
  if (USER_CONFIG.updatedAt) serializable.updatedAt = USER_CONFIG.updatedAt;
  fs.mkdirSync(path.dirname(USER_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(USER_CONFIG_PATH, `${JSON.stringify(serializable, null, 2)}\n`);
}

function capabilityLabel(capability) {
  return {
    player: "Live Player",
    stream: "Live Stream",
    candidate: "Video Candidate",
    snapshot: "Current Still",
    page: "Source Page",
    source: "Source",
  }[capability] || "Source";
}

function shortCameraName(name) {
  return String(name || "")
    .replace(/^Oregon /i, "")
    .replace(/^Corvallis /i, "")
    .replace(/^Newport /i, "")
    .replace(/^Eugene /i, "")
    .slice(0, 36);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "camera";
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicSample(items, max, keySelector = "id") {
  if (!Array.isArray(items) || items.length <= max) return items || [];
  return items
    .map((item, index) => ({ item, score: hashKey(typeof keySelector === "function" ? keySelector(item) : item[keySelector] || index) }))
    .sort((left, right) => left.score - right.score)
    .slice(0, max)
    .map((entry) => entry.item);
}

function hashKey(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function radians(value) {
  return (value * Math.PI) / 180;
}

function degrees(value) {
  return (value * 180) / Math.PI;
}

function normalizeLng(value) {
  let lng = value;
  while (lng < -180) lng += 360;
  while (lng > 180) lng -= 360;
  return lng;
}

function loadBrowserExport(filePath, exportName) {
  const source = fs.readFileSync(filePath, "utf8");
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source}; this.__export__ = ${exportName};`, context, { filename: filePath });
  return context.__export__;
}

function loadBundledConfig() {
  return loadConfigFromCandidates([
    path.join(ROOT, "config.local.json"),
    path.join(ROOT, "resources", "config.local.json"),
    path.join(path.dirname(ROOT), "config.local.json"),
    path.join(path.dirname(ROOT), "resources", "config.local.json"),
  ]);
}

function loadUserConfig() {
  return loadConfigFromCandidates([USER_CONFIG_PATH]);
}

function loadConfigFromCandidates(candidates = []) {
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      console.warn(`Unable to read ${path.basename(filePath)}: ${error.message}`);
    }
  }
  return {};
}

function listenOnPreferredPort(index) {
  const port = FALLBACK_PORTS[index];
  if (!port) throw new Error(`Unable to bind Oversee to any preferred port: ${FALLBACK_PORTS.join(", ")}`);
  serverPort = port;

  const handleListening = () => {
    server.off("error", handleError);
    console.log(`Oversee running at http://localhost:${port}`);
  };

  const handleError = (error) => {
    server.off("listening", handleListening);
    if (error.code === "EADDRINUSE" && index < FALLBACK_PORTS.length - 1) {
      listenOnPreferredPort(index + 1);
      return;
    }
    throw error;
  };

  server.once("listening", handleListening);
  server.once("error", handleError);
  server.listen(port, "127.0.0.1");
}

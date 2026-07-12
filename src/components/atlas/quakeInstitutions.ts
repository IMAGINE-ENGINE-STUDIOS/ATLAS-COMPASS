/**
 * Curated catalog of institutional seismic data authorities and real-time
 * streaming sources. Used by the event library so users can browse and
 * "tune in" to authoritative feeds from anywhere in the world (with a
 * dedicated United States section — the country with the largest public
 * seismic infrastructure).
 *
 * Every entry links to a real, publicly documented data service. No
 * simulated / fake feeds — see the project data-authenticity constraint.
 */

export type QuakeSourceKind =
  | "catalog"    // FDSNWS event catalog (queryable, JSON)
  | "stream"     // real-time SeedLink / WebSocket / SSE feed
  | "waveform"   // FDSNWS dataselect / IRIS waveform archive
  | "shakemap"   // ShakeMap / intensity products
  | "portal";    // Web portal / dashboard

export interface QuakeInstitution {
  id: string;
  name: string;
  country: string;              // "USA" for the US block
  agency: string;               // Short agency / operator label
  kinds: QuakeSourceKind[];
  url: string;                  // Human-readable portal
  api?: string;                 // Machine URL (FDSNWS query, SeedLink, WS…)
  fdsnSource?: "usgs" | "emsc" | "iris" | "isc" | "geofon"; // maps to panel source
  notes?: string;
}

export const QUAKE_INSTITUTIONS: QuakeInstitution[] = [
  // ── United States ────────────────────────────────────────────────────
  {
    id: "usgs-neic",
    name: "USGS National Earthquake Information Center",
    country: "USA",
    agency: "USGS NEIC",
    kinds: ["catalog", "shakemap", "portal"],
    url: "https://earthquake.usgs.gov/earthquakes/search/",
    api: "https://earthquake.usgs.gov/fdsnws/event/1/query",
    fdsnSource: "usgs",
    notes: "Global authoritative catalog · ShakeMap, PAGER, DYFI products.",
  },
  {
    id: "usgs-anss",
    name: "USGS ANSS Comprehensive Catalog (ComCat)",
    country: "USA",
    agency: "USGS ANSS",
    kinds: ["catalog"],
    url: "https://earthquake.usgs.gov/data/comcat/",
    api: "https://earthquake.usgs.gov/fdsnws/event/1/query",
    fdsnSource: "usgs",
  },
  {
    id: "iris-dmc",
    name: "IRIS Data Management Center (EarthScope)",
    country: "USA",
    agency: "IRIS DMC",
    kinds: ["catalog", "waveform", "stream"],
    url: "https://service.iris.edu/",
    api: "https://service.iris.edu/fdsnws/event/1/query",
    fdsnSource: "iris",
    notes: "SeedLink: rtserve.iris.washington.edu:18000",
  },
  {
    id: "iris-rtserve",
    name: "IRIS Real-Time SeedLink (rtserve)",
    country: "USA",
    agency: "IRIS DMC",
    kinds: ["stream", "waveform"],
    url: "https://ds.iris.edu/ds/nodes/dmc/services/seedlink/",
    api: "seedlink://rtserve.iris.washington.edu:18000",
    notes: "Global real-time miniSEED waveform stream.",
  },
  {
    id: "ncedc",
    name: "Northern California Earthquake Data Center",
    country: "USA",
    agency: "NCEDC / UC Berkeley",
    kinds: ["catalog", "waveform"],
    url: "https://ncedc.org/",
    api: "https://service.ncedc.org/fdsnws/event/1/query",
  },
  {
    id: "scedc",
    name: "Southern California Earthquake Data Center",
    country: "USA",
    agency: "SCEDC / Caltech",
    kinds: ["catalog", "waveform"],
    url: "https://scedc.caltech.edu/",
    api: "https://service.scedc.caltech.edu/fdsnws/event/1/query",
  },
  {
    id: "pnsn",
    name: "Pacific Northwest Seismic Network",
    country: "USA",
    agency: "PNSN / UW",
    kinds: ["catalog", "stream", "portal"],
    url: "https://pnsn.org/",
    api: "https://pnsn.org/events.json",
  },
  {
    id: "aec",
    name: "Alaska Earthquake Center",
    country: "USA",
    agency: "UAF AEC",
    kinds: ["catalog", "portal"],
    url: "https://earthquake.alaska.edu/",
    api: "https://earthquake.alaska.edu/earthquakes",
  },
  {
    id: "hvo",
    name: "USGS Hawaiian Volcano Observatory",
    country: "USA",
    agency: "USGS HVO",
    kinds: ["catalog", "portal"],
    url: "https://www.usgs.gov/observatories/hvo/earthquakes",
    fdsnSource: "usgs",
  },
  {
    id: "noaa-ntwc",
    name: "NOAA National Tsunami Warning Center",
    country: "USA",
    agency: "NOAA NTWC",
    kinds: ["stream", "portal"],
    url: "https://tsunami.gov/",
    api: "https://tsunami.gov/events/xml/PAAQAtom.xml",
  },
  {
    id: "noaa-ptwc",
    name: "NOAA Pacific Tsunami Warning Center",
    country: "USA",
    agency: "NOAA PTWC",
    kinds: ["stream", "portal"],
    url: "https://ptwc.weather.gov/",
    api: "https://ptwc.weather.gov/feeds/ptwc_rss_pacific.xml",
  },
  {
    id: "usarray",
    name: "USArray Transportable Array (EarthScope)",
    country: "USA",
    agency: "EarthScope",
    kinds: ["waveform", "stream"],
    url: "https://ds.iris.edu/gmap/#network=TA",
    api: "https://service.iris.edu/fdsnws/dataselect/1/query",
  },
  {
    id: "raspberryshake",
    name: "Raspberry Shake Global Citizen Network",
    country: "USA",
    agency: "Raspberry Shake",
    kinds: ["stream", "portal", "catalog"],
    url: "https://raspberryshake.net/stationview/",
    api: "https://data.raspberryshake.org/fdsnws/event/1/query",
    notes: "Real-time low-cost sensor mesh, WebSocket live view.",
  },

  // ── International ────────────────────────────────────────────────────
  {
    id: "emsc",
    name: "European-Mediterranean Seismological Centre",
    country: "France (Intl)",
    agency: "EMSC-CSEM",
    kinds: ["catalog", "stream", "portal"],
    url: "https://www.emsc-csem.org/",
    api: "https://www.seismicportal.eu/fdsnws/event/1/query",
    fdsnSource: "emsc",
    notes: "WebSocket stream: wss://www.seismicportal.eu/standing_order/websocket",
  },
  {
    id: "isc",
    name: "International Seismological Centre (Reviewed Bulletin)",
    country: "United Kingdom (Intl)",
    agency: "ISC",
    kinds: ["catalog"],
    url: "https://www.isc.ac.uk/",
    api: "https://www.isc.ac.uk/fdsnws/event/1/query",
    fdsnSource: "isc",
  },
  {
    id: "geofon",
    name: "GEOFON Program (GFZ Potsdam)",
    country: "Germany",
    agency: "GFZ / GEOFON",
    kinds: ["catalog", "stream", "waveform"],
    url: "https://geofon.gfz-potsdam.de/",
    api: "https://geofon.gfz-potsdam.de/fdsnws/event/1/query",
    fdsnSource: "geofon",
  },
  {
    id: "jma",
    name: "Japan Meteorological Agency",
    country: "Japan",
    agency: "JMA",
    kinds: ["catalog", "portal", "stream"],
    url: "https://www.jma.go.jp/bosai/map.html#5/33/135/&elem=int&contents=earthquake_map",
  },
  {
    id: "ingv",
    name: "Istituto Nazionale di Geofisica e Vulcanologia",
    country: "Italy",
    agency: "INGV",
    kinds: ["catalog", "waveform", "portal"],
    url: "https://terremoti.ingv.it/",
    api: "https://webservices.ingv.it/fdsnws/event/1/query",
  },
  {
    id: "gns",
    name: "GeoNet New Zealand",
    country: "New Zealand",
    agency: "GNS Science",
    kinds: ["catalog", "stream", "portal"],
    url: "https://www.geonet.org.nz/earthquake",
    api: "https://api.geonet.org.nz/quake?MMI=-1",
  },
  {
    id: "ga",
    name: "Geoscience Australia — Earthquakes",
    country: "Australia",
    agency: "Geoscience Australia",
    kinds: ["catalog", "portal"],
    url: "https://earthquakes.ga.gov.au/",
  },
  {
    id: "bmkg",
    name: "BMKG Indonesia",
    country: "Indonesia",
    agency: "BMKG",
    kinds: ["catalog", "portal"],
    url: "https://www.bmkg.go.id/gempabumi",
    api: "https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json",
  },
  {
    id: "cenc",
    name: "China Earthquake Networks Center",
    country: "China",
    agency: "CENC",
    kinds: ["catalog", "portal"],
    url: "https://www.cenc.ac.cn/",
  },
  {
    id: "resif",
    name: "RESIF-EPOS (French Seismological Data Portal)",
    country: "France",
    agency: "RESIF",
    kinds: ["catalog", "waveform"],
    url: "https://www.resif.fr/",
    api: "https://ws.resif.fr/fdsnws/event/1/query",
  },
];

export const QUAKE_STREAM_PRESETS: {
  id: string; label: string; url: string; kind: "websocket" | "seedlink" | "sse" | "atom";
  provider: string; description: string;
}[] = [
  {
    id: "emsc-ws",
    label: "EMSC live WebSocket",
    url: "wss://www.seismicportal.eu/standing_order/websocket",
    kind: "websocket",
    provider: "EMSC-CSEM",
    description: "Real-time global earthquake events as JSON messages.",
  },
  {
    id: "iris-seedlink",
    label: "IRIS SeedLink (rtserve)",
    url: "seedlink://rtserve.iris.washington.edu:18000",
    kind: "seedlink",
    provider: "IRIS DMC",
    description: "Global real-time waveform stream (miniSEED).",
  },
  {
    id: "raspshake-ws",
    label: "Raspberry Shake StationView",
    url: "wss://data.raspberryshake.org/live",
    kind: "websocket",
    provider: "Raspberry Shake",
    description: "Live global citizen-sensor network stream.",
  },
  {
    id: "geofon-seedlink",
    label: "GEOFON SeedLink",
    url: "seedlink://geofon.gfz-potsdam.de:18000",
    kind: "seedlink",
    provider: "GFZ Potsdam",
  },
  {
    id: "ptwc-atom",
    label: "NOAA PTWC alerts (Atom)",
    url: "https://ptwc.weather.gov/feeds/ptwc_rss_pacific.xml",
    kind: "atom",
    provider: "NOAA PTWC",
    description: "Pacific tsunami bulletin feed.",
  },
  {
    id: "ntwc-atom",
    label: "NOAA NTWC alerts (Atom)",
    url: "https://tsunami.gov/events/xml/PAAQAtom.xml",
    kind: "atom",
    provider: "NOAA NTWC",
  },
];
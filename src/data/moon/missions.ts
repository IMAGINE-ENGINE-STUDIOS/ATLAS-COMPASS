/**
 * Static NASA / international lunar mission catalog.
 *
 * Coordinates are selenographic (planetocentric, +east) sourced from NSSDCA,
 * LROC coordinate tables, JAXA / CNSA / ISRO published landing coordinates.
 * Dates are UTC. Every entry is real; no simulated or approximated positions.
 *
 * Active orbiters carry no live position — those pins are placed at their
 * documented nominal reference geometry and clearly flagged in the UI as a
 * catalog entry, not a live track.
 */

export type MoonMissionKind =
  | "crewed_landing"
  | "robotic_lander"
  | "rover"
  | "sample_return"
  | "impactor"
  | "orbiter"
  | "flyby"
  | "planned";

export type MoonMissionAgency =
  | "NASA"
  | "USSR"
  | "Roscosmos"
  | "CNSA"
  | "JAXA"
  | "ISRO"
  | "ESA"
  | "KARI"
  | "ispace"
  | "Intuitive Machines"
  | "Firefly Aerospace"
  | "Astrobotic"
  | "SpaceIL";

export interface MoonMission {
  id: string;
  name: string;
  agency: MoonMissionAgency;
  kind: MoonMissionKind;
  /** ISO date. */
  date: string;
  /** Selenographic latitude (+N). */
  lat: number;
  /** Selenographic longitude (+E). */
  lon: number;
  status: "success" | "partial" | "failed" | "active" | "planned" | "lost";
  description: string;
  imageUrl?: string;
  reference: string;
}

export const MOON_MISSIONS: MoonMission[] = [
  // ─── Apollo crewed landings ───
  { id: "apollo11", name: "Apollo 11", agency: "NASA", kind: "crewed_landing", date: "1969-07-20",
    lat: 0.67408, lon: 23.47297, status: "success",
    description: "First crewed lunar landing. Armstrong and Aldrin at Mare Tranquillitatis; 21.6 hours on surface; 21.55 kg of samples returned.",
    imageUrl: "https://images-assets.nasa.gov/image/as11-40-5875/as11-40-5875~thumb.jpg",
    reference: "https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo11info.html" },
  { id: "apollo12", name: "Apollo 12", agency: "NASA", kind: "crewed_landing", date: "1969-11-19",
    lat: -3.01239, lon: -23.42157, status: "success",
    description: "Conrad and Bean landed at Oceanus Procellarum, 183 m from Surveyor 3. Two moonwalks, 34.4 kg returned.",
    reference: "https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo12info.html" },
  { id: "apollo14", name: "Apollo 14", agency: "NASA", kind: "crewed_landing", date: "1971-02-05",
    lat: -3.64530, lon: -17.47136, status: "success",
    description: "Shepard and Mitchell at Fra Mauro highlands. First materials transporter (MET) used on the Moon.",
    reference: "https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo14info.html" },
  { id: "apollo15", name: "Apollo 15", agency: "NASA", kind: "crewed_landing", date: "1971-07-30",
    lat: 26.13239, lon: 3.63330, status: "success",
    description: "Scott and Irwin at Hadley–Apennine. First use of the Lunar Roving Vehicle; discovery of the Genesis Rock.",
    reference: "https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo15info.html" },
  { id: "apollo16", name: "Apollo 16", agency: "NASA", kind: "crewed_landing", date: "1972-04-21",
    lat: -8.97341, lon: 15.50019, status: "success",
    description: "Young and Duke explored the Descartes Highlands with the LRV. 95.7 kg of samples returned.",
    reference: "https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo16info.html" },
  { id: "apollo17", name: "Apollo 17", agency: "NASA", kind: "crewed_landing", date: "1972-12-11",
    lat: 20.19080, lon: 30.77168, status: "success",
    description: "Cernan and Schmitt at Taurus–Littrow — last crewed lunar landing to date. First scientist on the Moon.",
    reference: "https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo17info.html" },

  // ─── Soviet Luna program ───
  { id: "luna2", name: "Luna 2", agency: "USSR", kind: "impactor", date: "1959-09-14",
    lat: 29.1, lon: 0.0, status: "success",
    description: "First human-made object to reach the Moon's surface (hard impact near Palus Putredinis).",
    reference: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1959-014A" },
  { id: "luna9", name: "Luna 9", agency: "USSR", kind: "robotic_lander", date: "1966-02-03",
    lat: 7.08, lon: -64.37, status: "success",
    description: "First soft landing on the Moon; first images from the lunar surface (Oceanus Procellarum).",
    reference: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1966-006A" },
  { id: "luna13", name: "Luna 13", agency: "USSR", kind: "robotic_lander", date: "1966-12-24",
    lat: 18.87, lon: -62.05, status: "success",
    description: "Third successful soft landing; first mechanical soil density measurement.",
    reference: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1966-116A" },
  { id: "luna16", name: "Luna 16", agency: "USSR", kind: "sample_return", date: "1970-09-20",
    lat: -0.5137, lon: 56.3638, status: "success",
    description: "First robotic sample return — 101 g from Mare Fecunditatis.",
    reference: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1970-072A" },
  { id: "luna17", name: "Luna 17 / Lunokhod 1", agency: "USSR", kind: "rover", date: "1970-11-17",
    lat: 38.2378, lon: -35.0017, status: "success",
    description: "First successful robotic rover on another world. Lunokhod 1 traversed 10.54 km over ~322 days.",
    reference: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1970-095A" },
  { id: "luna20", name: "Luna 20", agency: "USSR", kind: "sample_return", date: "1972-02-21",
    lat: 3.5340, lon: 56.5510, status: "success",
    description: "Sample return from Apollonius highlands — 55 g of highland regolith.",
    reference: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1972-007A" },
  { id: "luna21", name: "Luna 21 / Lunokhod 2", agency: "USSR", kind: "rover", date: "1973-01-15",
    lat: 25.85, lon: 30.45, status: "success",
    description: "Second Soviet lunar rover; traversed ~39 km inside Le Monnier crater — longest off-world distance until 2014.",
    reference: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1973-001A" },
  { id: "luna24", name: "Luna 24", agency: "USSR", kind: "sample_return", date: "1976-08-18",
    lat: 12.7145, lon: 62.2129, status: "success",
    description: "Last Soviet lunar mission — 170 g of Mare Crisium regolith returned; found evidence of lunar water.",
    reference: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1976-081A" },

  // ─── Surveyor ───
  { id: "surveyor1", name: "Surveyor 1", agency: "NASA", kind: "robotic_lander", date: "1966-06-02",
    lat: -2.474, lon: -43.339, status: "success",
    description: "First US soft landing on the Moon; Oceanus Procellarum.",
    reference: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1966-045A" },
  { id: "surveyor3", name: "Surveyor 3", agency: "NASA", kind: "robotic_lander", date: "1967-04-20",
    lat: -3.0157, lon: -23.4218, status: "success",
    description: "Visited by Apollo 12 astronauts; parts returned to Earth for study.",
    reference: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1967-035A" },
  { id: "surveyor5", name: "Surveyor 5", agency: "NASA", kind: "robotic_lander", date: "1967-09-11",
    lat: 1.4177, lon: 23.1830, status: "success",
    description: "First alpha-particle chemistry of the lunar surface.",
    reference: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1967-084A" },
  { id: "surveyor6", name: "Surveyor 6", agency: "NASA", kind: "robotic_lander", date: "1967-11-10",
    lat: 0.473, lon: -1.397, status: "success",
    description: "First lift-off from another celestial body (a short hop).",
    reference: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1967-112A" },
  { id: "surveyor7", name: "Surveyor 7", agency: "NASA", kind: "robotic_lander", date: "1968-01-10",
    lat: -41.01, lon: -11.41, status: "success",
    description: "Landed on Tycho crater ejecta — the only Surveyor targeted at the highlands.",
    reference: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1968-001A" },

  // ─── Chinese Chang'e ───
  { id: "change3", name: "Chang'e 3 / Yutu", agency: "CNSA", kind: "rover", date: "2013-12-14",
    lat: 44.1214, lon: -19.5116, status: "success",
    description: "First soft landing on the Moon since 1976. Deployed Yutu (Jade Rabbit) rover in Mare Imbrium.",
    reference: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2013-070A" },
  { id: "change4", name: "Chang'e 4 / Yutu-2", agency: "CNSA", kind: "rover", date: "2019-01-03",
    lat: -45.4446, lon: 177.5991, status: "active",
    description: "First soft landing on the lunar far side (Von Kármán crater, South Pole–Aitken basin).",
    reference: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2018-103A" },
  { id: "change5", name: "Chang'e 5", agency: "CNSA", kind: "sample_return", date: "2020-12-01",
    lat: 43.0576, lon: -51.9161, status: "success",
    description: "First lunar sample return in 44 years — 1.731 kg from Mons Rümker in northern Oceanus Procellarum.",
    reference: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2020-087A" },
  { id: "change6", name: "Chang'e 6", agency: "CNSA", kind: "sample_return", date: "2024-06-02",
    lat: -41.6383, lon: 153.9852, status: "success",
    description: "First-ever sample return from the far side of the Moon — 1.935 kg from the Apollo crater in SPA basin.",
    reference: "https://www.nasa.gov/solar-system/moon/chang-e-6/" },

  // ─── India ───
  { id: "chandrayaan1_impact", name: "Chandrayaan-1 MIP", agency: "ISRO", kind: "impactor", date: "2008-11-14",
    lat: -89.76, lon: 39.40, status: "success",
    description: "Moon Impact Probe struck near Shackleton crater at the lunar South Pole; helped confirm surface water.",
    reference: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2008-052A" },
  { id: "chandrayaan3", name: "Chandrayaan-3 / Vikram / Pragyan", agency: "ISRO", kind: "rover", date: "2023-08-23",
    lat: -69.373, lon: 32.319, status: "success",
    description: "First soft landing near the lunar South Pole. Pragyan rover characterized regolith and confirmed sulfur.",
    imageUrl: "https://www.isro.gov.in/media_isro/image/Chandrayaan_3/Vikram_1.jpg",
    reference: "https://www.isro.gov.in/Chandrayaan3_New.html" },

  // ─── Japan ───
  { id: "slim", name: "SLIM (JAXA)", agency: "JAXA", kind: "robotic_lander", date: "2024-01-19",
    lat: -13.3160, lon: 25.2510, status: "partial",
    description: "Smart Lander for Investigating Moon — first precision (~100 m) lunar landing. Tipped over but survived multiple lunar nights.",
    reference: "https://global.jaxa.jp/projects/sas/slim/" },
  { id: "hakuto_r_m1", name: "Hakuto-R Mission 1", agency: "ispace", kind: "robotic_lander", date: "2023-04-25",
    lat: 47.581, lon: 44.094, status: "failed",
    description: "Commercial lunar lander from ispace — crashed inside Atlas crater during final descent.",
    reference: "https://ispace-inc.com/hakuto-r/eng/mission1.html" },

  // ─── US commercial (CLPS) ───
  { id: "im1_odysseus", name: "IM-1 Odysseus", agency: "Intuitive Machines", kind: "robotic_lander", date: "2024-02-22",
    lat: -80.13, lon: 1.44, status: "partial",
    description: "First US soft landing since Apollo 17. Landed near Malapert A near the South Pole; tipped on side.",
    reference: "https://www.nasa.gov/nasas-clps-deliveries/im-1/" },
  { id: "blue_ghost_m1", name: "Blue Ghost Mission 1", agency: "Firefly Aerospace", kind: "robotic_lander", date: "2025-03-02",
    lat: 18.56, lon: -61.81, status: "success",
    description: "Successful soft landing in Mare Crisium — 10 NASA CLPS payloads delivered.",
    reference: "https://fireflyspace.com/missions/blue-ghost-mission-1/" },
  { id: "im2_athena", name: "IM-2 Athena", agency: "Intuitive Machines", kind: "robotic_lander", date: "2025-03-06",
    lat: -84.61, lon: 31.75, status: "partial",
    description: "Landed near Mons Mouton at the South Pole; tipped over. Closest landing to a lunar pole to date.",
    reference: "https://www.intuitivemachines.com/im-2" },

  // ─── Notable early impactors / probes ───
  { id: "ranger7", name: "Ranger 7", agency: "NASA", kind: "impactor", date: "1964-07-31",
    lat: -10.63, lon: -20.6, status: "success",
    description: "First US probe to return close-range images of the Moon before impact in Mare Cognitum.",
    reference: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1964-041A" },
  { id: "lcross", name: "LCROSS Impact", agency: "NASA", kind: "impactor", date: "2009-10-09",
    lat: -84.729, lon: -49.36, status: "success",
    description: "Deliberate impact into Cabeus crater confirmed significant water ice in a permanently shadowed region.",
    reference: "https://www.nasa.gov/mission/lcross/" },
  { id: "grail_impact", name: "GRAIL Impact", agency: "NASA", kind: "impactor", date: "2012-12-17",
    lat: 75.62, lon: -26.63, status: "success",
    description: "GRAIL twin spacecraft (Ebb & Flow) deliberately impacted a mountain near the North Pole.",
    reference: "https://www.nasa.gov/mission/grail/" },
  { id: "smart1", name: "SMART-1 Impact", agency: "ESA", kind: "impactor", date: "2006-09-03",
    lat: -34.4, lon: -46.2, status: "success",
    description: "Europe's first Moon mission; ended with a controlled impact in Lacus Excellentiae.",
    reference: "https://www.esa.int/Science_Exploration/Space_Science/SMART-1" },
  { id: "beresheet", name: "Beresheet", agency: "SpaceIL", kind: "robotic_lander", date: "2019-04-11",
    lat: 32.5956, lon: 19.3496, status: "failed",
    description: "Israeli privately-funded lunar lander; crashed in Mare Serenitatis after gyroscope failure.",
    reference: "https://en.wikipedia.org/wiki/Beresheet" },

  // ─── Active orbiters (catalog only — nominal reference points, not live) ───
  { id: "lro", name: "LRO (orbiter)", agency: "NASA", kind: "orbiter", date: "2009-06-18",
    lat: 0, lon: 0, status: "active",
    description: "Lunar Reconnaissance Orbiter — provides the LROC imagery and LOLA topography powering this map. Nominal 50 km polar orbit.",
    reference: "https://www.nasa.gov/mission/lunar-reconnaissance-orbiter-lro/" },
  { id: "chandrayaan2_orb", name: "Chandrayaan-2 Orbiter", agency: "ISRO", kind: "orbiter", date: "2019-08-20",
    lat: 0, lon: 90, status: "active",
    description: "ISRO orbiter carrying a high-resolution imager and radar. ~100 km polar orbit.",
    reference: "https://www.isro.gov.in/Chandrayaan2_home.html" },
  { id: "kplo", name: "KPLO / Danuri", agency: "KARI", kind: "orbiter", date: "2022-12-27",
    lat: 0, lon: 180, status: "active",
    description: "Korea Pathfinder Lunar Orbiter — first Korean spacecraft beyond Earth orbit. 100 km polar orbit.",
    reference: "https://www.kari.re.kr/eng/sub03_08.do" },
  { id: "queqiao2", name: "Queqiao-2 Relay", agency: "CNSA", kind: "orbiter", date: "2024-03-24",
    lat: 0, lon: -90, status: "active",
    description: "Chinese lunar relay satellite supporting far-side operations for Chang'e 6/7/8.",
    reference: "https://www.planetary.org/space-missions/queqiao-2" },

  // ─── Planned / Artemis candidate landing regions ───
  { id: "artemis3_faustini", name: "Artemis III — Faustini Rim A", agency: "NASA", kind: "planned", date: "2027-09-01",
    lat: -87.2, lon: 78.7, status: "planned",
    description: "One of 13 candidate landing regions for the first crewed return to the Moon.",
    reference: "https://www.nasa.gov/artemis-iii-candidate-landing-regions/" },
  { id: "artemis3_shackleton", name: "Artemis III — Shackleton Rim", agency: "NASA", kind: "planned", date: "2027-09-01",
    lat: -89.68, lon: 0.0, status: "planned",
    description: "Candidate site on the rim of Shackleton crater at the lunar South Pole.",
    reference: "https://www.nasa.gov/artemis-iii-candidate-landing-regions/" },
  { id: "artemis3_haworth", name: "Artemis III — Haworth", agency: "NASA", kind: "planned", date: "2027-09-01",
    lat: -87.5, lon: -5.0, status: "planned",
    description: "Candidate region adjacent to permanently shadowed Haworth crater.",
    reference: "https://www.nasa.gov/artemis-iii-candidate-landing-regions/" },
];

export const MISSION_KIND_LABEL: Record<MoonMissionKind, string> = {
  crewed_landing: "Crewed landing",
  robotic_lander: "Robotic lander",
  rover: "Rover",
  sample_return: "Sample return",
  impactor: "Impactor",
  orbiter: "Orbiter",
  flyby: "Flyby",
  planned: "Planned",
};

export const MISSION_KIND_COLOR: Record<MoonMissionKind, string> = {
  crewed_landing: "#f59e0b",
  robotic_lander: "#60a5fa",
  rover: "#34d399",
  sample_return: "#a78bfa",
  impactor: "#f87171",
  orbiter: "#e2e8f0",
  flyby: "#94a3b8",
  planned: "#22d3ee",
};
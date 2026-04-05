// Global Maritime Shipping Lanes & Air Cargo Routes
// Real-world trade route paths based on actual shipping lanes and air corridors

export type CargoCategory = "container" | "oil" | "lng" | "bulk" | "roro" | "chemical" | "general" | "passenger" | "air-cargo" | "air-express" | "air-mail";

export const CARGO_CATEGORIES: { id: CargoCategory; label: string; icon: string; color: string }[] = [
  { id: "container", label: "Container", icon: "📦", color: "#3b82f6" },
  { id: "oil", label: "Oil Tanker", icon: "🛢️", color: "#f59e0b" },
  { id: "lng", label: "LNG", icon: "🔵", color: "#06b6d4" },
  { id: "bulk", label: "Bulk Cargo", icon: "🪨", color: "#8b5cf6" },
  { id: "roro", label: "RoRo/Vehicle", icon: "🚗", color: "#10b981" },
  { id: "chemical", label: "Chemical", icon: "⚗️", color: "#ef4444" },
  { id: "general", label: "General", icon: "📋", color: "#64748b" },
  { id: "air-cargo", label: "Air Cargo", icon: "📦", color: "#f472b6" },
  { id: "air-express", label: "Air Express", icon: "⚡", color: "#facc15" },
  { id: "air-mail", label: "Air Mail", icon: "✉️", color: "#86efac" },
];

export type CargoRoute = {
  id: string;
  name: string;
  type: "maritime" | "air";
  color: string;
  category: CargoCategory;
  waypoints: [number, number][]; // [lng, lat]
  distance: string;
  transitTime: string;
};

export const MARITIME_ROUTES: CargoRoute[] = [
  // ── Trans-Pacific ──
  { id:"m1",name:"Shanghai → Los Angeles",type:"maritime",color:"#3b82f6",category:"container",distance:"6,252 nm",transitTime:"14-16 days",
    waypoints:[[121.47,31.23],[122.07,30.62],[123.46,29.87],[126.58,26.06],[127.64,24.73],[131.0,28.5],[136.0,31.5],[141.5,34.0],[146.0,35.5],[152.0,36.5],[158.0,36.8],[164.0,36.5],[170.0,35.8],[176.0,35.2],[-178.0,35.0],[-172.0,34.5],[-166.0,34.2],[-160.0,34.0],[-154.0,33.8],[-148.0,33.6],[-142.0,33.5],[-136.0,33.5],[-130.0,33.6],[-124.0,33.7],[-118.27,33.73]],
  },
  { id:"m2",name:"Busan → Long Beach",type:"maritime",color:"#60a5fa",category:"container",distance:"5,887 nm",transitTime:"13-15 days",
    waypoints:[[129.08,35.08],[131.0,34.5],[135.0,34.0],[140.0,34.5],[146.0,35.5],[152.0,36.0],[158.0,36.2],[164.0,36.0],[170.0,35.5],[176.0,35.0],[-178.0,34.5],[-172.0,34.2],[-166.0,34.0],[-160.0,33.8],[-154.0,33.7],[-148.0,33.6],[-142.0,33.5],[-136.0,33.5],[-130.0,33.6],[-124.0,33.7],[-118.19,33.77]],
  },
  { id:"m3",name:"Tokyo → Seattle",type:"maritime",color:"#93c5fd",category:"roro",distance:"4,787 nm",transitTime:"10-12 days",
    waypoints:[[139.77,35.45],[142.0,36.0],[146.0,38.0],[152.0,40.5],[158.0,42.5],[164.0,44.0],[170.0,45.5],[176.0,46.5],[-178.0,47.0],[-172.0,47.5],[-166.0,47.8],[-160.0,48.0],[-154.0,48.0],[-148.0,48.0],[-142.0,48.0],[-136.0,48.0],[-130.0,48.0],[-125.0,47.8],[-122.34,47.61]],
  },
  { id:"m4",name:"Shenzhen → Oakland",type:"maritime",color:"#2563eb",category:"container",distance:"6,484 nm",transitTime:"15-17 days",
    waypoints:[[113.94,22.54],[114.30,22.20],[115.50,21.20],[117.80,19.80],[120.30,18.20],[123.0,16.0],[130.0,18.5],[140.0,24.0],[150.0,28.0],[160.0,30.5],[170.0,32.0],[-180.0,33.0],[-170.0,34.0],[-160.0,35.0],[-150.0,36.0],[-140.0,37.0],[-130.0,37.5],[-124.0,37.7],[-122.33,37.80]],
  },
  // ── Trans-Atlantic ──
  { id:"m5",name:"Rotterdam → New York",type:"maritime",color:"#f59e0b",category:"container",distance:"3,459 nm",transitTime:"8-10 days",
    waypoints:[[4.48,51.92],[3.60,51.80],[2.50,51.40],[1.30,51.10],[-0.80,50.60],[-3.50,50.00],[-5.70,49.50],[-8.50,48.80],[-12.0,48.00],[-18.0,47.00],[-24.0,45.50],[-30.0,43.50],[-36.0,42.00],[-42.0,41.00],[-48.0,40.50],[-54.0,40.30],[-60.0,40.40],[-66.0,40.50],[-70.0,40.55],[-74.01,40.68]],
  },
  { id:"m6",name:"Houston → Rotterdam",type:"maritime",color:"#d97706",category:"oil",distance:"5,038 nm",transitTime:"14-16 days",
    waypoints:[[-95.06,29.57],[-92.0,28.5],[-89.0,27.5],[-86.0,26.0],[-83.0,25.0],[-80.0,24.8],[-75.0,25.0],[-70.0,25.5],[-60.0,26.0],[-50.0,27.5],[-40.0,30.0],[-35.0,32.0],[-30.0,35.0],[-25.0,38.0],[-20.0,41.0],[-15.0,44.0],[-10.0,46.5],[-5.5,48.5],[-2.0,49.5],[0.0,50.5],[2.0,51.0],[4.48,51.92]],
  },
  { id:"m7",name:"Hamburg → Savannah",type:"maritime",color:"#fbbf24",category:"container",distance:"4,348 nm",transitTime:"11-13 days",
    waypoints:[[9.97,53.54],[8.80,53.80],[7.50,54.10],[5.50,53.80],[3.50,52.50],[1.0,51.20],[-2.0,50.0],[-5.0,49.0],[-8.5,48.0],[-13.0,46.5],[-18.0,44.0],[-24.0,41.0],[-30.0,38.0],[-36.0,36.0],[-42.0,34.5],[-48.0,33.5],[-54.0,33.0],[-60.0,32.5],[-66.0,32.2],[-72.0,32.1],[-78.0,32.1],[-80.85,32.08]],
  },
  // ── Asia–Europe via Suez ──
  { id:"m9",name:"Singapore → Rotterdam (Suez)",type:"maritime",color:"#ef4444",category:"container",distance:"8,288 nm",transitTime:"21-25 days",
    waypoints:[[103.85,1.29],[103.50,1.20],[102.0,2.0],[100.0,3.50],[97.50,5.50],[93.0,7.50],[86.0,9.0],[80.0,9.50],[76.0,10.0],[72.0,11.0],[66.0,12.50],[60.0,13.50],[56.0,13.0],[52.0,12.80],[48.0,12.60],[45.0,12.50],[43.50,12.70],[43.15,13.50],[43.30,16.0],[42.80,19.0],[41.50,21.50],[38.50,24.50],[35.50,27.50],[33.85,29.00],[32.58,29.95],[32.35,30.60],[32.32,31.26],[30.50,32.50],[28.0,34.0],[25.0,35.50],[20.0,36.50],[15.0,37.50],[10.0,38.50],[5.0,40.0],[0.0,43.0],[-3.0,46.0],[-5.0,48.0],[-2.0,49.50],[0.0,50.50],[2.50,51.50],[4.48,51.92]],
  },
  { id:"m10",name:"Shanghai → Hamburg (Suez)",type:"maritime",color:"#dc2626",category:"container",distance:"10,594 nm",transitTime:"28-32 days",
    waypoints:[[121.47,31.23],[120.0,28.0],[117.0,23.0],[114.30,22.20],[112.0,18.0],[109.0,12.0],[106.0,7.0],[104.5,3.0],[103.85,1.29],[100.0,3.50],[95.0,6.0],[86.0,9.0],[78.0,10.0],[70.0,12.0],[60.0,13.50],[50.0,12.80],[45.0,12.50],[43.50,12.70],[43.15,14.0],[42.50,18.0],[40.0,22.0],[36.0,27.0],[33.85,29.0],[32.58,29.95],[32.32,31.26],[28.0,34.0],[22.0,36.0],[15.0,37.50],[8.0,39.0],[2.0,42.0],[-3.0,46.0],[-5.0,48.0],[-2.0,50.0],[2.0,51.50],[5.0,53.0],[9.97,53.54]],
  },
  // ── Persian Gulf Oil & LNG ──
  { id:"m11",name:"Ras Tanura → Chiba (Oil)",type:"maritime",color:"#f59e0b",category:"oil",distance:"6,590 nm",transitTime:"18-22 days",
    waypoints:[[50.17,26.67],[51.0,26.0],[54.0,24.50],[56.50,23.50],[58.50,22.0],[60.0,20.0],[62.0,17.0],[65.0,13.0],[70.0,10.0],[78.0,7.0],[86.0,4.0],[95.0,2.0],[103.85,1.29],[106.0,4.0],[110.0,9.0],[114.0,15.0],[118.0,20.0],[124.0,26.0],[130.0,30.0],[135.0,33.0],[139.85,35.50]],
  },
  { id:"m12",name:"Qatar → Incheon (LNG)",type:"maritime",color:"#06b6d4",category:"lng",distance:"7,100 nm",transitTime:"20-24 days",
    waypoints:[[51.55,25.90],[53.0,25.0],[56.0,23.50],[58.50,22.0],[60.0,18.0],[55.0,14.0],[50.0,12.50],[46.0,12.50],[44.0,12.60],[43.50,12.80],[48.0,10.0],[55.0,5.0],[65.0,2.0],[78.0,1.0],[88.0,0.50],[95.0,1.0],[100.0,2.0],[103.85,1.29],[106.0,4.0],[110.0,10.0],[114.0,16.0],[118.0,22.0],[122.0,26.0],[125.0,30.0],[127.0,33.0],[126.45,37.46]],
  },
  { id:"m13",name:"Jebel Ali → Mumbai",type:"maritime",color:"#a855f7",category:"container",distance:"1,194 nm",transitTime:"3-4 days",
    waypoints:[[55.03,25.02],[55.30,24.80],[56.30,24.20],[57.50,23.50],[59.0,22.80],[60.50,22.00],[62.0,21.0],[64.0,20.0],[66.50,19.50],[69.0,19.0],[71.0,18.95],[72.88,18.92]],
  },
  // ── Strait of Malacca ──
  { id:"m14",name:"Singapore → Hong Kong",type:"maritime",color:"#ec4899",category:"container",distance:"1,457 nm",transitTime:"3-4 days",
    waypoints:[[103.85,1.29],[104.20,1.50],[105.0,2.50],[106.50,4.50],[108.0,7.0],[109.50,9.50],[111.0,12.0],[112.50,14.50],[113.50,17.0],[114.0,19.5],[114.17,22.28]],
  },
  // ── Intra-Asia ──
  { id:"m15",name:"Shanghai → Singapore",type:"maritime",color:"#14b8a6",category:"container",distance:"2,265 nm",transitTime:"5-6 days",
    waypoints:[[121.47,31.23],[120.50,28.50],[118.50,25.0],[116.50,22.0],[114.50,19.50],[112.50,16.0],[110.0,12.0],[108.0,8.0],[106.0,5.0],[104.50,3.0],[103.85,1.29]],
  },
  { id:"m16",name:"Busan → Kaohsiung",type:"maritime",color:"#2dd4bf",category:"bulk",distance:"910 nm",transitTime:"2-3 days",
    waypoints:[[129.08,35.08],[128.0,33.50],[126.50,31.50],[125.0,29.50],[123.50,27.50],[122.0,25.50],[120.70,23.50],[120.27,22.61]],
  },
  // ── Cape of Good Hope ──
  { id:"m17",name:"Singapore → Cape Town",type:"maritime",color:"#f97316",category:"oil",distance:"5,935 nm",transitTime:"16-19 days",
    waypoints:[[103.85,1.29],[98.0,-2.0],[90.0,-5.0],[82.0,-8.0],[74.0,-12.0],[65.0,-16.0],[55.0,-20.0],[45.0,-25.0],[38.0,-28.0],[32.0,-30.0],[27.0,-32.0],[22.0,-33.5],[18.42,-33.92]],
  },
  { id:"m18",name:"Cape Town → Rotterdam",type:"maritime",color:"#ea580c",category:"bulk",distance:"6,233 nm",transitTime:"17-20 days",
    waypoints:[[18.42,-33.92],[14.0,-30.0],[10.0,-24.0],[6.0,-16.0],[2.0,-8.0],[-1.0,0.0],[-4.0,8.0],[-8.0,16.0],[-10.0,24.0],[-10.0,32.0],[-8.0,38.0],[-6.0,43.0],[-4.0,47.0],[-2.0,49.50],[0.0,50.50],[2.50,51.50],[4.48,51.92]],
  },
  // ── South America ──
  { id:"m19",name:"Santos → Rotterdam",type:"maritime",color:"#84cc16",category:"bulk",distance:"5,759 nm",transitTime:"15-18 days",
    waypoints:[[-46.30,-23.96],[-44.0,-22.0],[-40.0,-18.0],[-35.0,-12.0],[-28.0,-5.0],[-22.0,2.0],[-18.0,10.0],[-15.0,18.0],[-13.0,26.0],[-11.0,34.0],[-9.0,40.0],[-6.0,45.0],[-3.0,48.0],[0.0,50.0],[2.50,51.50],[4.48,51.92]],
  },
  // ── Panama Canal ──
  { id:"m20",name:"New York → LA (Panama)",type:"maritime",color:"#06b6d4",category:"container",distance:"4,897 nm",transitTime:"13-15 days",
    waypoints:[[-74.01,40.68],[-75.0,38.0],[-76.0,34.0],[-77.50,30.0],[-79.0,26.0],[-80.0,23.0],[-80.50,20.0],[-80.0,15.0],[-79.70,10.0],[-79.55,8.95],[-79.90,8.85],[-80.50,8.50],[-82.0,8.80],[-85.0,10.50],[-90.0,13.0],[-95.0,15.50],[-100.0,18.0],[-104.0,20.50],[-108.0,23.0],[-112.0,26.0],[-115.0,29.0],[-118.27,33.73]],
  },
  // ── Mediterranean ──
  { id:"m21",name:"Piraeus → Barcelona",type:"maritime",color:"#e11d48",category:"container",distance:"1,320 nm",transitTime:"3-4 days",
    waypoints:[[23.63,37.94],[21.0,37.50],[18.0,37.20],[15.0,37.50],[12.0,38.0],[9.0,38.50],[6.0,39.0],[4.0,39.80],[2.17,41.39]],
  },
  { id:"m22",name:"Algeciras → Port Said",type:"maritime",color:"#be123c",category:"chemical",distance:"2,100 nm",transitTime:"5-7 days",
    waypoints:[[-5.45,36.13],[-3.50,36.0],[-1.0,36.20],[2.0,36.50],[5.0,37.0],[8.0,37.50],[11.0,37.80],[14.0,37.50],[17.0,36.50],[20.0,35.50],[23.0,34.50],[26.0,33.50],[29.0,32.50],[31.0,31.80],[32.32,31.26]],
  },
  // ── Africa & Australia ──
  { id:"m23",name:"Lagos → Antwerp",type:"maritime",color:"#c026d3",category:"oil",distance:"4,422 nm",transitTime:"12-15 days",
    waypoints:[[3.39,6.45],[2.50,5.50],[0.0,5.0],[-3.0,5.0],[-7.0,5.50],[-10.0,8.0],[-12.0,13.0],[-13.0,20.0],[-12.0,28.0],[-10.0,35.0],[-8.0,40.0],[-5.0,44.0],[-3.0,47.0],[-1.0,49.0],[1.0,50.50],[4.42,51.23]],
  },
  { id:"m24",name:"Melbourne → Singapore",type:"maritime",color:"#0ea5e9",category:"bulk",distance:"3,325 nm",transitTime:"9-11 days",
    waypoints:[[144.96,-37.81],[142.0,-35.0],[138.0,-30.0],[132.0,-24.0],[126.0,-18.0],[120.0,-14.0],[115.0,-10.0],[112.0,-7.0],[108.0,-4.0],[105.0,-1.0],[103.85,1.29]],
  },
  { id:"m25",name:"Sydney → Shanghai",type:"maritime",color:"#0284c7",category:"lng",distance:"4,990 nm",transitTime:"13-15 days",
    waypoints:[[151.21,-33.87],[150.0,-30.0],[148.0,-24.0],[145.0,-18.0],[140.0,-12.0],[135.0,-6.0],[130.0,0.0],[125.0,6.0],[122.0,13.0],[121.0,20.0],[121.0,26.0],[121.47,31.23]],
  },
  // ── Northern Sea Route ──
  { id:"m26",name:"Murmansk → Busan (Arctic)",type:"maritime",color:"#64748b",category:"lng",distance:"7,200 nm",transitTime:"20-25 days",
    waypoints:[[33.08,68.97],[38.0,69.50],[45.0,70.50],[55.0,72.0],[68.0,73.50],[80.0,74.50],[95.0,75.50],[110.0,76.0],[125.0,74.50],[140.0,72.0],[152.0,68.0],[162.0,62.0],[168.0,56.0],[162.0,48.0],[150.0,42.0],[140.0,38.0],[135.0,36.0],[129.08,35.08]],
  },
  { id:"m27",name:"Chennai → Jeddah",type:"maritime",color:"#8b5cf6",category:"general",distance:"2,580 nm",transitTime:"7-9 days",
    waypoints:[[80.28,13.08],[79.0,11.0],[77.0,8.50],[75.0,8.0],[72.0,9.0],[67.0,11.0],[60.0,13.0],[55.0,14.0],[50.0,13.50],[46.0,13.0],[43.50,13.50],[42.50,16.0],[40.50,19.0],[39.17,21.49]],
  },
];

export const AIR_CARGO_ROUTES: CargoRoute[] = [
  { id:"a1",name:"Hong Kong → Los Angeles",type:"air",color:"#f472b6",category:"air-cargo",distance:"11,650 km",transitTime:"13h",
    waypoints:[[113.92,22.31],[120.0,26.0],[130.0,32.0],[142.0,37.0],[156.0,40.0],[170.0,41.0],[-175.0,40.0],[-160.0,38.0],[-145.0,36.0],[-130.0,34.5],[-118.41,33.94]],
  },
  { id:"a2",name:"Shanghai → Chicago (Polar)",type:"air",color:"#fb7185",category:"air-cargo",distance:"11,023 km",transitTime:"14h",
    waypoints:[[121.81,31.14],[125.0,35.0],[132.0,42.0],[140.0,50.0],[150.0,56.0],[165.0,62.0],[-180.0,65.0],[-165.0,63.0],[-145.0,58.0],[-125.0,52.0],[-110.0,47.0],[-97.0,43.0],[-87.90,41.98]],
  },
  { id:"a3",name:"Incheon → Anchorage → Memphis",type:"air",color:"#e879f9",category:"air-express",distance:"12,400 km",transitTime:"16h",
    waypoints:[[126.45,37.46],[130.0,40.0],[138.0,46.0],[148.0,52.0],[160.0,57.0],[175.0,60.0],[-165.0,61.0],[-150.0,61.17],[-140.0,58.0],[-125.0,50.0],[-110.0,43.0],[-98.0,38.0],[-89.98,35.04]],
  },
  { id:"a4",name:"London → New York (JFK)",type:"air",color:"#facc15",category:"air-cargo",distance:"5,570 km",transitTime:"7h",
    waypoints:[[-0.46,51.47],[-5.0,52.0],[-12.0,53.0],[-22.0,53.0],[-32.0,51.0],[-42.0,48.0],[-52.0,45.0],[-62.0,42.50],[-73.78,40.64]],
  },
  { id:"a5",name:"Frankfurt → Chicago",type:"air",color:"#fde047",category:"air-cargo",distance:"6,960 km",transitTime:"9h",
    waypoints:[[8.57,50.03],[3.0,51.0],[-5.0,53.0],[-15.0,55.0],[-28.0,56.0],[-42.0,55.0],[-55.0,52.0],[-68.0,48.0],[-78.0,44.0],[-87.90,41.98]],
  },
  { id:"a6",name:"Dubai → London Heathrow",type:"air",color:"#a78bfa",category:"air-cargo",distance:"5,480 km",transitTime:"7h",
    waypoints:[[55.36,25.25],[50.0,28.0],[44.0,32.0],[37.0,36.0],[30.0,39.0],[22.0,42.0],[14.0,46.0],[6.0,49.0],[-0.46,51.47]],
  },
  { id:"a7",name:"Dubai → Hong Kong",type:"air",color:"#c084fc",category:"air-cargo",distance:"5,960 km",transitTime:"8h",
    waypoints:[[55.36,25.25],[60.0,25.0],[68.0,24.0],[76.0,23.50],[84.0,23.0],[92.0,22.80],[100.0,22.50],[108.0,22.40],[113.92,22.31]],
  },
  { id:"a8",name:"Doha → Singapore",type:"air",color:"#8b5cf6",category:"air-cargo",distance:"6,020 km",transitTime:"8h",
    waypoints:[[51.61,25.27],[56.0,23.0],[64.0,19.0],[72.0,15.0],[80.0,11.0],[88.0,7.0],[95.0,4.0],[100.0,2.0],[103.99,1.35]],
  },
  { id:"a9",name:"Shanghai → Singapore",type:"air",color:"#34d399",category:"air-express",distance:"3,820 km",transitTime:"5h",
    waypoints:[[121.81,31.14],[119.0,27.0],[116.0,22.0],[113.0,17.0],[110.0,12.0],[107.0,7.0],[105.0,3.50],[103.99,1.35]],
  },
  { id:"a10",name:"Hong Kong → Tokyo Narita",type:"air",color:"#6ee7b7",category:"air-cargo",distance:"2,890 km",transitTime:"4h",
    waypoints:[[113.92,22.31],[117.0,24.0],[122.0,26.50],[127.0,29.0],[132.0,31.50],[136.0,33.50],[140.39,35.77]],
  },
  { id:"a11",name:"Memphis → Cologne (FedEx)",type:"air",color:"#67e8f9",category:"air-express",distance:"7,975 km",transitTime:"10h",
    waypoints:[[-89.98,35.04],[-82.0,39.0],[-68.0,44.0],[-52.0,49.0],[-35.0,52.0],[-20.0,53.0],[-8.0,52.0],[0.0,51.50],[6.96,50.87]],
  },
  { id:"a12",name:"Louisville → London (UPS)",type:"air",color:"#06b6d4",category:"air-express",distance:"6,920 km",transitTime:"9h",
    waypoints:[[-85.74,38.17],[-78.0,41.0],[-65.0,45.0],[-50.0,49.0],[-35.0,52.0],[-20.0,52.50],[-10.0,52.0],[-0.46,51.47]],
  },
  { id:"a13",name:"Addis Ababa → Guangzhou",type:"air",color:"#4ade80",category:"air-cargo",distance:"7,780 km",transitTime:"10h",
    waypoints:[[38.80,8.98],[45.0,11.0],[55.0,14.0],[65.0,17.0],[76.0,20.0],[88.0,21.50],[100.0,22.50],[113.30,23.39]],
  },
  { id:"a14",name:"Sydney → Singapore",type:"air",color:"#38bdf8",category:"air-cargo",distance:"6,290 km",transitTime:"8h",
    waypoints:[[151.18,-33.95],[146.0,-27.0],[138.0,-19.0],[128.0,-12.0],[118.0,-6.0],[110.0,-2.0],[103.99,1.35]],
  },
  { id:"a15",name:"Anchorage → Shanghai (Polar)",type:"air",color:"#d946ef",category:"air-cargo",distance:"8,460 km",transitTime:"11h",
    waypoints:[[-150.0,61.17],[-165.0,60.0],[180.0,56.0],[165.0,50.0],[150.0,44.0],[140.0,38.0],[130.0,34.0],[121.81,31.14]],
  },
  { id:"a16",name:"Leipzig → Shenzhen (DHL)",type:"air",color:"#f43f5e",category:"air-express",distance:"9,180 km",transitTime:"12h",
    waypoints:[[12.24,51.42],[18.0,49.0],[26.0,45.0],[36.0,40.0],[48.0,35.0],[60.0,30.0],[72.0,27.0],[84.0,25.0],[96.0,23.50],[106.0,23.0],[113.94,22.54]],
  },
  { id:"a17",name:"Miami → São Paulo",type:"air",color:"#22d3ee",category:"air-cargo",distance:"6,590 km",transitTime:"9h",
    waypoints:[[-80.29,25.79],[-76.0,20.0],[-68.0,12.0],[-58.0,2.0],[-52.0,-8.0],[-48.0,-16.0],[-46.47,-23.43]],
  },
  { id:"a18",name:"Los Angeles → Sydney",type:"air",color:"#0ea5e9",category:"air-cargo",distance:"12,050 km",transitTime:"15h",
    waypoints:[[-118.41,33.94],[-125.0,28.0],[-135.0,18.0],[-145.0,8.0],[-155.0,-2.0],[-165.0,-12.0],[-175.0,-22.0],[180.0,-28.0],[168.0,-32.0],[158.0,-34.0],[151.18,-33.95]],
  },
];

export const ALL_CARGO_ROUTES = [...MARITIME_ROUTES, ...AIR_CARGO_ROUTES];

// Interpolate position along route waypoints given progress 0-1
export function interpolatePosition(waypoints: [number, number][], progress: number): [number, number] {
  const p = Math.max(0, Math.min(1, progress));
  const totalSegments = waypoints.length - 1;
  const segment = p * totalSegments;
  const idx = Math.floor(segment);
  const frac = segment - idx;
  if (idx >= totalSegments) return waypoints[totalSegments];
  const [lng1, lat1] = waypoints[idx];
  const [lng2, lat2] = waypoints[idx + 1];
  let dLng = lng2 - lng1;
  if (dLng > 180) dLng -= 360;
  if (dLng < -180) dLng += 360;
  let lng = lng1 + dLng * frac;
  if (lng > 180) lng -= 360;
  if (lng < -180) lng += 360;
  return [lng, lat1 + (lat2 - lat1) * frac];
}

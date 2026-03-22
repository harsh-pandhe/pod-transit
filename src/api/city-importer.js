import { KMZParser } from './kmz-parser.js';

function normalizeToCanvas(points, width = 760, height = 560, padding = 80) {
  if (!points || points.length === 0) return [];

  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latSpan = Math.max(1e-9, maxLat - minLat);
  const lngSpan = Math.max(1e-9, maxLng - minLng);

  return points.map((point) => {
    const nx = (point.lng - minLng) / lngSpan;
    const ny = (point.lat - minLat) / latSpan;
    return {
      ...point,
      x: padding + nx * (width - 2 * padding),
      y: height - (padding + ny * (height - 2 * padding)),
    };
  });
}

function buildGraphFromStations(stations) {
  const nodes = {};
  stations.forEach((s, idx) => {
    nodes[s.name || s.id || `Node ${idx + 1}`] = {
      x: s.x,
      y: s.y,
      name: s.name || s.id || `Node ${idx + 1}`,
      type: s.type === 'depot' ? 'depot' : 'station',
    };
  });

  const ids = Object.keys(nodes);
  const edges = [];
  for (let i = 0; i < ids.length - 1; i++) {
    edges.push({ from: ids[i], to: ids[i + 1], curve: 24 });
    edges.push({ from: ids[i + 1], to: ids[i], curve: -24 });
  }

  if (ids.length > 2) {
    edges.push({ from: ids[ids.length - 1], to: ids[0], curve: 24 });
    edges.push({ from: ids[0], to: ids[ids.length - 1], curve: -24 });
  }

  return { nodes, edges };
}

export async function importCityNetworkFromKmz(file) {
  const parsed = await KMZParser.parseKMZFile(file);
  if (!parsed) {
    return { ok: false, message: 'Could not parse KMZ file.' };
  }

  const stations = KMZParser.generateDepotStations(parsed);
  const allCoords = stations.map(s => ({ ...s, lat: Number(s.lat), lng: Number(s.lng) }));
  const normalized = normalizeToCanvas(allCoords);
  const graph = buildGraphFromStations(normalized);

  return {
    ok: true,
    cityName: parsed.name || file.name,
    nodes: graph.nodes,
    edges: graph.edges,
    stats: {
      stations: Object.values(graph.nodes).filter(n => n.type === 'station').length,
      depots: Object.values(graph.nodes).filter(n => n.type === 'depot').length,
      corridors: graph.edges.length / 2,
    },
  };
}

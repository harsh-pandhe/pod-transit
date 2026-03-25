import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Play, Pause, FastForward, Save, FolderOpen, RefreshCcw,
  MousePointer2, PlusCircle, Building2, Link2, Upload, Database, Plus, X, FileDown, FileUp, Repeat, BarChart3,
  Train, PanelRightOpen, PanelRightClose, Gauge
} from 'lucide-react';
import { UltraSimCore } from './api/ultra-sim-core.js';
import StationView from './components/StationView.jsx';
import DepotView from './components/DepotView.jsx';
import { importCityNetworkFromKmz } from './api/city-importer.js';
import { exportRunCsv, exportBoardPdfLike } from './api/report-exporter.js';

const SIM_STEP_SECONDS = 0.15;
const DEFAULT_CURVE = 36;
const LOW_BATTERY_THRESHOLD_PCT = 30;
const MIN_POD_SPEED_MPS = 5;
const MAX_POD_SPEED_MPS = 30;
const TIMELINE_EVENT_TYPES = new Set([
  'scenario_ended',
  'scenario_blocked_corridor',
  'scenario_outage',
  'charging_complete',
  'dispatch_nearest_waiting_group',
  'dispatch_station_ready_pool',
  'arrived_platform',
  'boarding_started',
  'depart_station',
  'low_battery_route_to_depot',
]);

function eventCategory(type = '') {
  if (type.includes('scenario') || type.includes('disruption') || type.includes('blocked') || type.includes('outage')) return 'scenario';
  if (type.includes('battery') || type.includes('charging')) return 'battery';
  if (type.includes('boarding') || type.includes('depart') || type.includes('arrived') || type.includes('path_selected')) return 'passenger';
  if (type.includes('dispatch') || type.includes('manual_add_pod')) return 'dispatch';
  return 'system';
}

function eventSummary(event) {
  const type = event?.type || 'event';
  const vehicle = event?.vehicleId ? ` ${event.vehicleId}` : '';

  switch (type) {
    case 'manual_add_pod':
      return `Pod${vehicle} added at ${event.depotId}`;
    case 'dispatch_nearest_waiting_group':
      return `Dispatch${vehicle} to ${event.stationId} (nearest waiting group)`;
    case 'dispatch_station_ready_pool':
      return `Stage${vehicle} at ${event.stationId} (ready pool)`;
    case 'boarding_started':
      return `Boarding${vehicle} at ${event.stationId} to ${event.destination}`;
    case 'arrived_platform':
      return `Arrived${vehicle} at ${event.stationId} platform ${event.platform || '-'}`;
    case 'depart_station':
      return `Depart${vehicle} from ${event.stationId}`;
    case 'low_battery_route_to_depot':
      return `Low battery${vehicle} ${event.battery}% -> ${event.depot}`;
    case 'charging_started':
      return `Charging started${vehicle} at ${event.depot} (${event.battery}%)`;
    case 'charging_complete':
      return `Charging complete${vehicle} at ${event.depot}`;
    default:
      return `${type.replaceAll('_', ' ')}${vehicle}`;
  }
}

const CASE_STUDIES = {
  airport_ring: {
    label: 'Airport Ring',
    nodes: {
      'Station 01': { x: 140, y: 560, name: 'Station 01', type: 'station' },
      'Station 02': { x: 280, y: 560, name: 'Station 02', type: 'station' },
      'Station 03': { x: 420, y: 560, name: 'Station 03', type: 'station' },
      'Station 04': { x: 560, y: 560, name: 'Station 04', type: 'station' },
      'Station 05': { x: 620, y: 430, name: 'Station 05', type: 'station' },
      'Station 06': { x: 620, y: 290, name: 'Station 06', type: 'station' },
      'Station 07': { x: 490, y: 210, name: 'Station 07', type: 'station' },
      'Station 08': { x: 330, y: 210, name: 'Station 08', type: 'station' },
      'Station 09': { x: 190, y: 300, name: 'Station 09', type: 'station' },
      'Depot A': { x: 90, y: 420, name: 'Depot A', type: 'depot' },
      'Depot B': { x: 670, y: 420, name: 'Depot B', type: 'depot' },
    },
    links: [
      ['Station 01', 'Station 02'],
      ['Station 02', 'Station 03'],
      ['Station 03', 'Station 04'],
      ['Station 04', 'Station 05'],
      ['Station 05', 'Station 06'],
      ['Station 06', 'Station 07'],
      ['Station 07', 'Station 08'],
      ['Station 08', 'Station 09'],
      ['Station 09', 'Station 01'],
      ['Station 09', 'Depot A'],
      ['Station 05', 'Depot B'],
    ],
  },
  downtown_spine: {
    label: 'Downtown Spine',
    nodes: {
      'North Station': { x: 380, y: 90, name: 'North Station', type: 'station' },
      'Midtown 1': { x: 380, y: 170, name: 'Midtown 1', type: 'station' },
      'Midtown 2': { x: 380, y: 250, name: 'Midtown 2', type: 'station' },
      'Central': { x: 380, y: 330, name: 'Central', type: 'station' },
      'South 1': { x: 380, y: 410, name: 'South 1', type: 'station' },
      'South 2': { x: 380, y: 490, name: 'South 2', type: 'station' },
      'West Hub': { x: 230, y: 330, name: 'West Hub', type: 'station' },
      'East Hub': { x: 530, y: 330, name: 'East Hub', type: 'station' },
      'Depot Central': { x: 640, y: 330, name: 'Depot Central', type: 'depot' },
    },
    links: [
      ['North Station', 'Midtown 1'],
      ['Midtown 1', 'Midtown 2'],
      ['Midtown 2', 'Central'],
      ['Central', 'South 1'],
      ['South 1', 'South 2'],
      ['Central', 'West Hub'],
      ['Central', 'East Hub'],
      ['East Hub', 'Depot Central'],
    ],
  },
  business_park: {
    label: 'Business Park',
    nodes: {
      'Gate': { x: 120, y: 220, name: 'Gate', type: 'station' },
      'Tower A': { x: 260, y: 160, name: 'Tower A', type: 'station' },
      'Tower B': { x: 420, y: 160, name: 'Tower B', type: 'station' },
      'Tower C': { x: 580, y: 160, name: 'Tower C', type: 'station' },
      'Food Court': { x: 260, y: 320, name: 'Food Court', type: 'station' },
      'Mall': { x: 420, y: 320, name: 'Mall', type: 'station' },
      'Parking': { x: 580, y: 320, name: 'Parking', type: 'station' },
      'Depot South': { x: 420, y: 440, name: 'Depot South', type: 'depot' },
    },
    links: [
      ['Gate', 'Tower A'],
      ['Tower A', 'Tower B'],
      ['Tower B', 'Tower C'],
      ['Tower A', 'Food Court'],
      ['Tower B', 'Mall'],
      ['Tower C', 'Parking'],
      ['Food Court', 'Mall'],
      ['Mall', 'Parking'],
      ['Mall', 'Depot South'],
    ],
  },
};

function edgeKey(from, to) {
  return `${from}->${to}`;
}

function normalizeEdges(rawEdges = []) {
  return rawEdges
    .map(edge => {
      if (Array.isArray(edge) && edge.length >= 2) {
        return { from: edge[0], to: edge[1], curve: 0 };
      }
      if (edge && typeof edge === 'object' && edge.from && edge.to) {
        return { from: edge.from, to: edge.to, curve: Number(edge.curve || 0) };
      }
      return null;
    })
    .filter(Boolean);
}

function withBidirectionalLinks(links) {
  const output = [];
  const seen = new Set();

  links.forEach(([from, to]) => {
    const forward = edgeKey(from, to);
    const reverse = edgeKey(to, from);

    if (!seen.has(forward)) {
      output.push({ from, to, curve: DEFAULT_CURVE });
      seen.add(forward);
    }
    if (!seen.has(reverse)) {
      output.push({ from: to, to: from, curve: -DEFAULT_CURVE });
      seen.add(reverse);
    }
  });

  return output;
}

function getQuadraticControlPoint(a, b, curve = 0) {
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return { x: midX + nx * curve, y: midY + ny * curve };
}

function getEdgePath(a, b, curve = 0) {
  const cp = getQuadraticControlPoint(a, b, curve);
  return `M ${a.x} ${a.y} Q ${cp.x} ${cp.y} ${b.x} ${b.y}`;
}

function getEdgePoint(a, b, t, curve = 0) {
  const cp = getQuadraticControlPoint(a, b, curve);
  const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cp.x + t * t * b.x;
  const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cp.y + t * t * b.y;
  return { x, y };
}

export default function App() {
  const [nodes, setNodes] = useState({});
  const [edges, setEdges] = useState([]);

  const [mode, setMode] = useState('select');
  const [hoverNode, setHoverNode] = useState(null);
  const [linkStart, setLinkStart] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [stationCounter, setStationCounter] = useState(1);
  const [depotCounter, setDepotCounter] = useState(1);
  const [detailedStation, setDetailedStation] = useState(null);
  const [detailedDepot, setDetailedDepot] = useState(null);
  const [selectedCaseStudy, setSelectedCaseStudy] = useState('airport_ring');
  const [editingEdge, setEditingEdge] = useState(null);
  const [edgeDistanceInput, setEdgeDistanceInput] = useState('');
  const [simSpeedMps, setSimSpeedMps] = useState(15);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [simRunning, setSimRunning] = useState(false);
  const [simMode, setSimMode] = useState('edit');
  const simCore = useRef(null);
  const [snapshot, setSnapshot] = useState(null);

  const [podIdInput, setPodIdInput] = useState('POD-201');
  const [selectedDepot, setSelectedDepot] = useState('');
  const [seedInput, setSeedInput] = useState('INVESTOR-DEMO-001');
  const [scenarioChoice, setScenarioChoice] = useState('peak_hour_surge');
  const [executiveMode, setExecutiveMode] = useState(false);
  const [storyMode, setStoryMode] = useState(false);
  const [analyticsTab, setAnalyticsTab] = useState('overview');
  const [logFilter, setLogFilter] = useState('all');
  const [logSearch, setLogSearch] = useState('');
  const [timelineNotes, setTimelineNotes] = useState([]);
  const [snapshotCards, setSnapshotCards] = useState([]);
  const [compareBaseline, setCompareBaseline] = useState(null);
  const [compareCurrent, setCompareCurrent] = useState(null);
  const [importedCityName, setImportedCityName] = useState('');

  // Drag state
  const [draggingNode, setDraggingNode] = useState(null);
  const [draggingEdge, setDraggingEdge] = useState(null);
  const [hoverEdge, setHoverEdge] = useState(null);

  const svgRef = useRef(null);
  const importInputRef = useRef(null);
  const loadInputRef = useRef(null);
  const lastCardMinuteRef = useRef(-1);

  const edgeMap = useMemo(() => {
    const map = new Map();
    edges.forEach(edge => map.set(edgeKey(edge.from, edge.to), edge));
    return map;
  }, [edges]);

  const uniqueCorridorCount = useMemo(() => {
    const set = new Set();
    edges.forEach(edge => {
      const key = [edge.from, edge.to].sort().join('<->');
      set.add(key);
    });
    return set.size;
  }, [edges]);

  const createCore = () => {
    const core = new UltraSimCore({
      nodes,
      edges,
      seed: seedInput,
      settings: {
        vehicleSpeedMps: simSpeedMps,
      },
    });
    const validation = core.validateNetwork();
    return { core, validation };
  };

  const applySpeedToCore = (nextSpeed) => {
    if (!simCore.current) return;
    simCore.current.settings.vehicleSpeedMps = nextSpeed;
  };

  const handleMouseMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const newPos = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setMousePos(newPos);

    // Update dragging node position
    if (draggingNode && (mode === 'select' || mode === 'drag')) {
      setNodes(prev => ({
        ...prev,
        [draggingNode]: { ...prev[draggingNode], x: newPos.x, y: newPos.y },
      }));
    }

    // Update dragging edge curve
    if (draggingEdge && mode === 'curve_link') {
      const edge = draggingEdge;
      const n1 = nodes[edge.from];
      const n2 = nodes[edge.to];
      if (n1 && n2) {
        const midX = (n1.x + n2.x) / 2;
        const midY = (n1.y + n2.y) / 2;
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const distToMid = Math.hypot(newPos.x - midX, newPos.y - midY);
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const dotProduct = (newPos.x - midX) * nx + (newPos.y - midY) * ny;
        const newCurve = Math.max(-120, Math.min(120, dotProduct));

        setEdges(prev =>
          prev.map(item => {
            if (item.from === edge.from && item.to === edge.to) {
              return { ...item, curve: newCurve };
            }
            if (item.from === edge.to && item.to === edge.from) {
              return { ...item, curve: -newCurve };
            }
            return item;
          })
        );
      }
    }
  };

  const handleCanvasClick = () => {
    if (simMode !== 'edit') return;

    if (mode === 'add_station') {
      const name = `Station ${stationCounter}`;
      setNodes(prev => ({ ...prev, [name]: { x: mousePos.x, y: mousePos.y, name, type: 'station' } }));
      setStationCounter(count => count + 1);
      return;
    }

    if (mode === 'add_depot') {
      const name = `Depot ${depotCounter}`;
      setNodes(prev => ({ ...prev, [name]: { x: mousePos.x, y: mousePos.y, name, type: 'depot' } }));
      setDepotCounter(count => count + 1);
      return;
    }

    if (mode === 'add_link') {
      setLinkStart(null);
    }
  };

  const handleNodeMouseDown = (event, nodeName) => {
    event.stopPropagation();
    if (mode === 'select' || mode === 'drag') {
      setDraggingNode(nodeName);
    }
  };

  const handleNodeMouseUp = () => {
    setDraggingNode(null);
  };

  const handleEdgeMouseDown = (event, edge) => {
    event.stopPropagation();
    if (mode === 'curve_link') {
      setDraggingEdge(edge);
    }
  };

  const handleEdgeMouseUp = () => {
    setDraggingEdge(null);
  };

  const handleDeleteEdge = (event, edge) => {
    event.stopPropagation();
    if (mode === 'delink') {
      setEdges(prev => prev.filter(e => !(e.from === edge.from && e.to === edge.to)));
    }
  };

  const addBidirectionalEdge = (a, b) => {
    if (a === b) return;

    setEdges(prev => {
      const hasForward = prev.some(edge => edge.from === a && edge.to === b);
      const hasReverse = prev.some(edge => edge.from === b && edge.to === a);
      const next = [...prev];

      if (!hasForward) next.push({ from: a, to: b, curve: DEFAULT_CURVE });
      if (!hasReverse) next.push({ from: b, to: a, curve: -DEFAULT_CURVE });

      return next;
    });
  };

  const handleNodeClick = (event, nodeName) => {
    event.stopPropagation();

    if (simMode === 'play') {
      if (nodes[nodeName]?.type === 'station') {
        setDetailedStation(nodeName);
        setDetailedDepot(null);
      }
      if (nodes[nodeName]?.type === 'depot') {
        setDetailedDepot(nodeName);
        setDetailedStation(null);
      }
      return;
    }

    if (mode === 'add_link') {
      if (!linkStart) {
        setLinkStart(nodeName);
      } else {
        addBidirectionalEdge(linkStart, nodeName);
        setLinkStart(null);
      }
    }
  };

  const handleCurveClick = (event, edge) => {
    if (simMode !== 'edit' || mode !== 'curve_link') return;
    event.stopPropagation();

    setEdges(prev => {
      const step = edge.curve >= 80 ? -80 : 20;
      const updated = prev.map(item => {
        if (item.from === edge.from && item.to === edge.to) {
          return { ...item, curve: item.curve + step };
        }
        if (item.from === edge.to && item.to === edge.from) {
          return { ...item, curve: -(item.curve + step) };
        }
        return item;
      });
      return updated;
    });
  };

  const handlePlay = () => {
    if (simMode === 'edit') {
      const { core, validation } = createCore();
      if (!validation.ok) {
        alert(`Network Error:\n${validation.errors.join('\n')}`);
        return;
      }
      simCore.current = core;
      setSimMode('play');
      setSnapshot(simCore.current.getSnapshot());
      setSelectedDepot(simCore.current.depotIds[0] || '');
      setTimelineNotes([{ t: 0, label: `Simulation started with seed ${seedInput}` }]);
      setSnapshotCards([]);
      setCompareBaseline(null);
      setCompareCurrent(null);
      lastCardMinuteRef.current = -1;
      setSidebarOpen(true);
    }
    setSimRunning(prev => !prev);
  };

  const handleStop = () => {
    setSimRunning(false);
    setSimMode('edit');
    simCore.current = null;
    setSnapshot(null);
    setDetailedStation(null);
    setDetailedDepot(null);
    setCompareCurrent(null);
  };

  const handleFastForward = () => {
    if (!simCore.current) return;
    simCore.current.runWarmup();
    setSnapshot(simCore.current.getSnapshot());
  };

  const handleAddPod = () => {
    if (!simCore.current || !selectedDepot) return;
    const result = simCore.current.addVehicleAtDepot({
      vehicleId: podIdInput,
      depotId: selectedDepot,
      battery: 90,
    });
    if (!result.ok) {
      alert(result.message);
      return;
    }

    const nextIdNum = Number((podIdInput.match(/(\d+)$/) || [0, 201])[1]) + 1;
    setPodIdInput(`POD-${String(nextIdNum).padStart(3, '0')}`);
    setSnapshot(simCore.current.getSnapshot());
  };

  const handleReplayFromSeed = () => {
    if (!simCore.current) return;
    simCore.current.resetWithSeed(seedInput);
    const next = simCore.current.getSnapshot();
    setSnapshot(next);
    setSimRunning(false);
    setTimelineNotes(prev => [...prev, { t: next.timeSec, label: `Replay reset with seed ${seedInput}` }].slice(-25));
  };

  const handleStartScenario = () => {
    if (!simCore.current) return;
    const result = simCore.current.applyScenario(scenarioChoice);
    if (!result.ok) return;
    const next = simCore.current.getSnapshot();
    setSnapshot(next);
    setTimelineNotes(prev => [...prev, { t: next.timeSec, label: `Scenario started: ${scenarioChoice}` }].slice(-25));
  };

  const handleInjectDisruption = () => {
    if (!simCore.current) return;
    const result = simCore.current.injectDisruption('blocked_corridor');
    if (!result.ok) return;
    const next = simCore.current.getSnapshot();
    setSnapshot(next);
    setTimelineNotes(prev => [...prev, { t: next.timeSec, label: 'Disruption injected: blocked corridor' }].slice(-25));
  };

  const handleCompare = () => {
    if (!simCore.current) return;
    const report = simCore.current.getRunReport();
    if (!compareBaseline) {
      setCompareBaseline(report);
      setTimelineNotes(prev => [...prev, { t: simCore.current.timeSec, label: 'Compare baseline captured' }].slice(-25));
      return;
    }
    setCompareCurrent(report);
  };

  const handleExportCsv = () => {
    if (!simCore.current) return;
    const report = simCore.current.getRunReport();
    const stationSummary = simCore.current.getResults().stationSummary;
    exportRunCsv(report, stationSummary);
  };

  const handleExportPdfLike = () => {
    if (!simCore.current) return;
    exportBoardPdfLike(simCore.current.getRunReport(), snapshotCards);
  };

  const handleImportCityClick = () => {
    importInputRef.current?.click();
  };

  const handleImportCity = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const imported = await importCityNetworkFromKmz(file);
    if (!imported.ok) {
      alert(imported.message || 'Import failed');
      return;
    }

    handleStop();
    setNodes(imported.nodes);
    setEdges(imported.edges);
    setImportedCityName(imported.cityName);
    setStationCounter(imported.stats.stations + 1);
    setDepotCounter(imported.stats.depots + 1);
    setTimelineNotes([{ t: 0, label: `Imported city network: ${imported.cityName}` }]);
  };

  const handleSave = () => {
    const data = { nodes, edges, stationCounter, depotCounter };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pod-network-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadClick = () => {
    loadInputRef.current?.click();
  };

  const handleLoadFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        handleStop();
        setNodes(data.nodes || {});
        setEdges(normalizeEdges(data.edges || []));
        setStationCounter(data.stationCounter || 1);
        setDepotCounter(data.depotCounter || 1);
        setTimelineNotes([{ t: 0, label: 'Network loaded from file.' }]);
      } catch (err) {
        alert('Invalid network file format');
      }
    };
    reader.readAsText(file);
    event.target.value = null; // clear input
  };

  const loadCaseStudy = (key) => {
    const config = CASE_STUDIES[key];
    if (!config) return;

    handleStop();
    setSelectedCaseStudy(key);
    setNodes(config.nodes);
    setEdges(withBidirectionalLinks(config.links));

    const stationCount = Object.values(config.nodes).filter(node => node.type === 'station').length;
    const depotCount = Object.values(config.nodes).filter(node => node.type === 'depot').length;
    setStationCounter(stationCount + 1);
    setDepotCounter(depotCount + 1);
  };

  useEffect(() => {
    // Start with a blank canvas by default per user requirements
  }, []);

  useEffect(() => {
    const onResize = () => {
      setSidebarOpen(window.innerWidth >= 1024);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!simRunning || !simCore.current) return;
    const interval = setInterval(() => {
      setSnapshot(simCore.current.step(SIM_STEP_SECONDS));
    }, 50);
    return () => clearInterval(interval);
  }, [simRunning]);

  useEffect(() => {
    if (!snapshot) return;
    const minute = Math.floor((snapshot.timeSec || 0) / 60);
    if (minute > 0 && minute % 2 === 0 && minute !== lastCardMinuteRef.current) {
      lastCardMinuteRef.current = minute;
      const report = snapshot.report || {};
      setSnapshotCards(prev => {
        const next = [...prev, {
          t: snapshot.timeSec,
          title: `Minute ${minute} Snapshot`,
          meanWaitSec: report.meanWaitSec || 0,
          utilizationPct: report.utilizationPct || 0,
          reliabilityPct: report.reliabilityPct || 0,
        }];
        return next.slice(-8);
      });
    }

    const lastEvent = snapshot.recentEvents?.[snapshot.recentEvents.length - 1];
    if (lastEvent && TIMELINE_EVENT_TYPES.has(lastEvent.type)) {
      setTimelineNotes(prev => {
        const labelMap = {
          dispatch_nearest_waiting_group: `dispatch to ${lastEvent.stationId || 'station'} for waiting group`,
          dispatch_station_ready_pool: `staging pod to ${lastEvent.stationId || 'station'} ready pool`,
          arrived_platform: `${lastEvent.vehicleId || 'pod'} arrived platform ${lastEvent.platform || '-'}`,
          boarding_started: `${lastEvent.vehicleId || 'pod'} boarding at ${lastEvent.stationId || 'station'}`,
          depart_station: `${lastEvent.vehicleId || 'pod'} left ${lastEvent.stationId || 'station'}`,
          low_battery_route_to_depot: `${lastEvent.vehicleId || 'pod'} low battery -> ${lastEvent.depot || 'depot'}`,
        };
        const note = { t: snapshot.timeSec, label: labelMap[lastEvent.type] || `${lastEvent.type.replaceAll('_', ' ')}` };
        if (prev.length > 0 && prev[prev.length - 1].label === note.label) return prev;
        return [...prev, note].slice(-25);
      });
    }
  }, [snapshot]);

  const vehicles = snapshot?.vehicles || [];
  const waitingByStation = snapshot?.waitingByStation || {};
  const simTime = snapshot ? Math.floor(snapshot.timeSec / 60) : 0;
  const chargingPods = vehicles.filter(v => v.state === 'charging').length;
  const lowBatteryPods = vehicles.filter(v => v.battery < LOW_BATTERY_THRESHOLD_PCT).length;
  const criticalBatteryPods = vehicles.filter(v => v.battery < 8).length;
  const report = snapshot?.report || null;
  const simSpeedKmh = Math.round(simSpeedMps * 3.6);
  const recentEvents = (snapshot?.recentEvents || []).slice(-8).reverse();
  const operationsFeed = useMemo(() => {
    const events = snapshot?.recentEvents || [];
    return events
      .slice()
      .reverse()
      .map((event) => {
        const category = eventCategory(event.type);
        const message = eventSummary(event);
        return {
          ...event,
          category,
          message,
        };
      })
      .filter((event) => {
        const categoryOk = logFilter === 'all' || event.category === logFilter;
        if (!categoryOk) return false;
        if (!logSearch.trim()) return true;
        const q = logSearch.trim().toLowerCase();
        return event.message.toLowerCase().includes(q)
          || String(event.type || '').toLowerCase().includes(q)
          || String(event.vehicleId || '').toLowerCase().includes(q)
          || String(event.stationId || '').toLowerCase().includes(q)
          || String(event.depot || '').toLowerCase().includes(q);
      })
      .slice(0, 140);
  }, [snapshot, logFilter, logSearch]);

  const exportOperationsLog = () => {
    if (!operationsFeed.length) return;
    const data = operationsFeed.map((event) => ({
      t: event.t,
      type: event.type,
      category: event.category,
      vehicleId: event.vehicleId || null,
      stationId: event.stationId || null,
      depot: event.depot || null,
      message: event.message,
    }));

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pod-operations-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const depotStats = (snapshot?.depotIds || Object.keys(nodes).filter(id => nodes[id]?.type === 'depot')).map(depotId => {
    const chargingVehicles = vehicles.filter(v => v.node === depotId && v.state === 'charging');
    const parkedVehicles = vehicles.filter(v => v.node === depotId && ['idle_empty', 'charging'].includes(v.state));
    const inboundChargeVehicles = vehicles.filter(v => {
      if (v.purpose !== 'charge' || v.node === depotId) return false;
      if (v.nextNode === depotId) return true;
      if (Array.isArray(v.route) && v.route.includes(depotId)) return true;
      if (Array.isArray(v.selectedRoute) && v.selectedRoute[v.selectedRoute.length - 1] === depotId) return true;
      return false;
    });

    return {
      depotId,
      chargingVehicles,
      parkedVehicles,
      inboundChargeVehicles,
    };
  });

  return (
    <div className="future-shell flex flex-col h-screen text-slate-100 font-sans select-none">
      <div className="future-titlebar h-8 flex items-center px-4 text-xs font-semibold titlebar shadow" style={{ WebkitAppRegion: 'drag' }}>
        <span className="inline-flex items-center gap-2">
          <Train size={14} />
          PodFlow Command Nexus - {simMode === 'edit' ? 'Network Design' : 'Live Operations'}
        </span>
      </div>

      <div className="future-toolbar h-16 backdrop-blur border-b flex items-center px-4 justify-between shadow-sm z-10">
        <div className="flex space-x-2 border-r pr-4 border-slate-200 items-center">
          <ToolbarButton icon={<FolderOpen />} label="Open" onClick={handleLoadClick} disabled={simMode === 'play'} />
          <ToolbarButton icon={<Save />} label="Save" onClick={handleSave} disabled={simMode === 'play'} />
          <ToolbarButton icon={<Database />} label="Case" onClick={() => loadCaseStudy(selectedCaseStudy)} disabled={simMode === 'play'} />
          <ToolbarButton icon={<FileUp />} label="Import" onClick={handleImportCityClick} disabled={simMode === 'play'} />
          <ToolbarButton icon={<RefreshCcw />} label="Clear" onClick={() => { setNodes({}); setEdges([]); setStationCounter(1); setDepotCounter(1); setDetailedStation(null); setDetailedDepot(null); }} disabled={simMode === 'play'} />
          <select
            value={selectedCaseStudy}
            onChange={(event) => loadCaseStudy(event.target.value)}
            disabled={simMode === 'play'}
            className="h-8 rounded border border-cyan-500/30 text-xs px-2 text-cyan-100 bg-slate-900/70"
          >
            {Object.entries(CASE_STUDIES).map(([key, item]) => (
              <option key={key} value={key}>{item.label}</option>
            ))}
          </select>
        </div>

        <div className="flex space-x-2 border-r pr-4 border-slate-200 pl-4">
          <ToolbarButton icon={<MousePointer2 />} label="Select" active={mode === 'select'} onClick={() => setMode('select')} disabled={simMode === 'play'} />
          <ToolbarButton icon={<PlusCircle />} label="Station" active={mode === 'add_station'} onClick={() => setMode('add_station')} disabled={simMode === 'play'} />
          <ToolbarButton icon={<Building2 />} label="Depot" active={mode === 'add_depot'} onClick={() => setMode('add_depot')} disabled={simMode === 'play'} />
          <ToolbarButton icon={<Link2 />} label="Link" active={mode === 'add_link'} onClick={() => setMode('add_link')} disabled={simMode === 'play'} />
          <ToolbarButton icon={<Upload />} label="Curve" active={mode === 'curve_link'} onClick={() => setMode('curve_link')} disabled={simMode === 'play'} />
          <ToolbarButton icon={<X />} label="Delink" active={mode === 'delink'} onClick={() => setMode('delink')} disabled={simMode === 'play'} />
        </div>

        <div className="flex space-x-2 pl-4">
          <ToolbarButton icon={simRunning ? <Pause className="text-amber-500" /> : <Play className="text-emerald-500" />} label={simRunning ? 'Pause' : 'Run'} onClick={handlePlay} />
          {simMode === 'play' && <ToolbarButton icon={<RefreshCcw />} label="Stop" onClick={handleStop} />}
          <ToolbarButton icon={<FastForward className="text-blue-500" />} label="Warmup" onClick={handleFastForward} disabled={simMode === 'edit'} />
          {simMode === 'play' && <ToolbarButton icon={<Repeat className="text-violet-500" />} label="Replay" onClick={handleReplayFromSeed} />}
          {simMode === 'play' && <ToolbarButton icon={<BarChart3 className="text-slate-700" />} label={executiveMode ? 'Ops' : 'Exec'} onClick={() => setExecutiveMode(prev => !prev)} />}
          {simMode === 'play' && <ToolbarButton icon={sidebarOpen ? <PanelRightClose /> : <PanelRightOpen />} label="Panel" onClick={() => setSidebarOpen(prev => !prev)} />}
        </div>
      </div>

      <input ref={importInputRef} type="file" accept=".kmz" className="hidden" onChange={handleImportCity} />
      <input ref={loadInputRef} type="file" accept=".json" className="hidden" onChange={handleLoadFile} />

      <div className="future-main flex flex-1 overflow-hidden relative">
        <svg ref={svgRef} className="w-full h-full cursor-crosshair" onMouseMove={handleMouseMove} onClick={handleCanvasClick} onMouseUp={handleNodeMouseUp} onMouseLeave={handleNodeMouseUp}>
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
            </pattern>
            <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {edges.map((edge) => {
            const n1 = nodes[edge.from];
            const n2 = nodes[edge.to];
            if (!n1 || !n2) return null;
            const path = getEdgePath(n1, n2, edge.curve);
            const cp = getQuadraticControlPoint(n1, n2, edge.curve);
            const strokeColor = edge.curve >= 0 ? '#334155' : '#64748b';
            const isHovering = hoverEdge?.from === edge.from && hoverEdge?.to === edge.to;
            const pathDistance = typeof edge.distance === 'number'
              ? edge.distance
              : Math.round(Math.hypot(n2.x - n1.x, n2.y - n1.y));

            return (
              <g key={edgeKey(edge.from, edge.to)}>
                <path
                  d={path}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isHovering ? "5" : "4"}
                  markerEnd="url(#arrow)"
                  onClick={(event) => {
                    if (mode === 'curve_link') handleCurveClick(event, edge);
                    else if (mode === 'delink') handleDeleteEdge(event, edge);
                    else if (simMode === 'edit' && mode !== 'add_link') {
                      event.stopPropagation();
                      setEditingEdge(edge);
                      const physicalDist = Math.hypot(n2.x - n1.x, n2.y - n1.y);
                      setEdgeDistanceInput(typeof edge.distance === 'number' ? edge.distance : Math.round(physicalDist));
                    }
                  }}
                  onMouseDown={(event) => handleEdgeMouseDown(event, edge)}
                  onMouseUp={handleEdgeMouseUp}
                  onMouseEnter={() => setHoverEdge(edge)}
                  onMouseLeave={() => setHoverEdge(null)}
                  className={mode === 'curve_link' || mode === 'delink' ? 'cursor-pointer' : ''}
                  style={{ opacity: isHovering ? 0.9 : 0.7 }}
                />
                <g
                  transform={`translate(${cp.x}, ${cp.y})`}
                  onClick={(event) => {
                    if (simMode !== 'edit') return;
                    if (mode === 'curve_link') {
                      handleCurveClick(event, edge);
                      return;
                    }
                    if (mode === 'delink') {
                      handleDeleteEdge(event, edge);
                      return;
                    }
                    event.stopPropagation();
                    setEditingEdge(edge);
                    setEdgeDistanceInput(pathDistance);
                  }}
                  className="cursor-pointer"
                >
                  <rect
                    x="-28"
                    y="-9"
                    width="56"
                    height="18"
                    rx="6"
                    fill={isHovering ? 'rgba(8,47,73,0.96)' : 'rgba(15,23,42,0.92)'}
                    stroke="rgba(34,211,238,0.38)"
                  />
                  <text y="4" fontSize="9" fill="#bae6fd" textAnchor="middle" fontWeight="700">
                    {Math.round(pathDistance)}m
                  </text>
                </g>
                {/* Curve control point (only in curve_link mode) */}
                {mode === 'curve_link' && (
                  <circle
                    cx={cp.x}
                    cy={cp.y}
                    r={isHovering || draggingEdge?.from === edge.from ? 8 : 5}
                    fill={draggingEdge?.from === edge.from ? '#3b82f6' : '#60a5fa'}
                    stroke="#1e293b"
                    strokeWidth="2"
                    className="cursor-grab active:cursor-grabbing"
                    onMouseDown={(event) => handleEdgeMouseDown(event, edge)}
                    onMouseUp={handleEdgeMouseUp}
                    onMouseEnter={() => setHoverEdge(edge)}
                    onMouseLeave={() => setHoverEdge(null)}
                  />
                )}
              </g>
            );
          })}

          {mode === 'add_link' && linkStart && nodes[linkStart] && (
            <line x1={nodes[linkStart].x} y1={nodes[linkStart].y} x2={mousePos.x} y2={mousePos.y} stroke="#3b82f6" strokeWidth="4" strokeDasharray="5,5" markerEnd="url(#arrow)" />
          )}

          {Object.values(nodes).map(node => (
            <g
              key={node.name}
              transform={`translate(${node.x}, ${node.y})`}
              onMouseEnter={() => setHoverNode(node.name)}
              onMouseLeave={() => setHoverNode(null)}
              onClick={(event) => handleNodeClick(event, node.name)}
              onMouseDown={(event) => handleNodeMouseDown(event, node.name)}
              onMouseUp={handleNodeMouseUp}
              className={draggingNode === node.name ? 'cursor-grabbing' : mode === 'select' ? 'cursor-grab' : 'cursor-pointer'}
            >
              {node.type === 'depot' ? (
                <g>
                  {(draggingNode === node.name || hoverNode === node.name) && (
                    <circle r="21" fill="#fb923c" opacity="0.28" className="animate-pulse" />
                  )}
                  <rect x="-16" y="-12" width="32" height="24" rx="6" fill={draggingNode === node.name || hoverNode === node.name ? '#fdba74' : '#f97316'} stroke="#7c2d12" strokeWidth="2.5" />
                  <path d="M-7 -2 h14 M0 -6 v12" stroke="#ffedd5" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="0" cy="8" r="2" fill="#fff7ed" />
                </g>
              ) : (
                <g>
                  {(draggingNode === node.name || hoverNode === node.name) && (
                    <circle r="18" fill="#38bdf8" opacity="0.3" className="animate-pulse" />
                  )}
                  <circle r="13" fill={draggingNode === node.name || hoverNode === node.name ? '#22d3ee' : '#0ea5e9'} stroke="#0f172a" strokeWidth="2.5" />
                  <circle r="7" fill="#082f49" stroke="#67e8f9" strokeWidth="1.5" />
                  <path d="M-4 -1.5 L0 -5 L4 -1.5 M0 -5 V5" stroke="#cffafe" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              )}
              <text y="24" fontSize="11" fill="#0f172a" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>{node.name}</text>

              {simMode === 'play' && node.type === 'station' && waitingByStation[node.name] > 0 && (
                <g transform="translate(12, -18)">
                  <circle r="8" fill="#ef4444" />
                  <text y="3" fontSize="9" fill="white" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>{waitingByStation[node.name]}</text>
                </g>
              )}

              {simMode === 'play' && node.type === 'depot' && (
                <g transform="translate(14, -18)">
                  <circle r="9" fill="#f59e0b" />
                  <text y="3" fontSize="9" fill="white" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>
                    {vehicles.filter(v => v.node === node.name && v.state === 'charging').length}
                  </text>
                </g>
              )}
            </g>
          ))}

          {vehicles.map(vehicle => {
            if (vehicle.state === 'idle_empty' && !vehicle.nextNode && nodes[vehicle.node]?.type !== 'depot') return null;
            const n1 = nodes[vehicle.node];
            const n2 = nodes[vehicle.nextNode] || n1;
            if (!n1 || !n2) return null;

            const progress = vehicle.edgeTravelSec > 0 ? Math.min(1, vehicle.edgeProgressSec / vehicle.edgeTravelSec) : 0;
            const edge = edgeMap.get(edgeKey(vehicle.node, vehicle.nextNode));
            const point = edge ? getEdgePoint(n1, n2, progress, edge.curve) : {
              x: n1.x + (n2.x - n1.x) * progress,
              y: n1.y + (n2.y - n1.y) * progress,
            };

            let color = '#ef4444';
            if (['boarding', 'moving_loaded', 'approaching_platform', 'docking'].includes(vehicle.state)) color = '#22c55e';
            else if (vehicle.state === 'unloading') color = '#3b82f6';
            else if (vehicle.state === 'waiting_slot') color = '#94a3b8';
            else if (vehicle.state === 'charging') color = '#eab308';

            return (
              <g key={vehicle.id} transform={`translate(${point.x}, ${point.y})`} className={vehicle.state === 'charging' ? 'animate-pulse' : ''}>
                <circle r="6" fill={color} stroke="#1e293b" strokeWidth="2" />
                <rect x="-13" y="-16" width="26" height="8" rx="2" fill="#1e293b" />
                <text y="-10" fontSize="6" fill="white" fontWeight="bold" textAnchor="middle">{vehicle.id}</text>
              </g>
            );
          })}
        </svg>

        {simMode === 'play' && sidebarOpen && (
          <button
            type="button"
            className="absolute inset-0 z-10 bg-slate-950/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          />
        )}

        {simMode === 'play' && (
          <div className={`future-sidebar absolute right-0 top-0 bottom-0 w-[90vw] max-w-[26rem] lg:w-[26rem] border-l shadow-xl flex flex-col pointer-events-auto z-20 transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="p-4 bg-gradient-to-r from-slate-50 to-cyan-50 border-b border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-bold text-slate-800">Control Panel</h2>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="lg:hidden p-1 hover:bg-slate-200 rounded"
                  aria-label="Close"
                >
                  <X size={20} className="text-slate-600" />
                </button>
              </div>
              <p className="text-xs text-slate-600">Real-time pod network simulation</p>
            </div>

            {/* Quick Start Section - Always Visible */}
            <div className="p-4 bg-white border-b border-slate-200 space-y-4">
              {/* Status Badges */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 p-3 border border-blue-200">
                  <div className="text-[10px] uppercase text-blue-700 font-bold tracking-wide">Active</div>
                  <div className="text-2xl font-bold text-blue-900">{vehicles.length}</div>
                  <div className="text-[10px] text-blue-700">pods</div>
                </div>
                <div className="rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100 p-3 border border-emerald-200">
                  <div className="text-[10px] uppercase text-emerald-700 font-bold tracking-wide">Served</div>
                  <div className="text-2xl font-bold text-emerald-900">{simCore.current?.getResults()?.totalServedGroups || 0}</div>
                  <div className="text-[10px] text-emerald-700">trips</div>
                </div>
                <div className="rounded-lg bg-gradient-to-br from-amber-50 to-amber-100 p-3 border border-amber-200">
                  <div className="text-[10px] uppercase text-amber-700 font-bold tracking-wide">Time</div>
                  <div className="text-2xl font-bold text-amber-900">{Math.floor(simTime / 60).toString().padStart(2, '0')}:{(simTime % 60).toString().padStart(2, '0')}</div>
                  <div className="text-[10px] text-amber-700">sim time</div>
                </div>
              </div>

              {/* Pod Status at a Glance */}
              <div className="rounded-lg border border-slate-200 p-3 space-y-2 bg-slate-50">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">Pod Status</div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 bg-green-500 rounded-full"></span>
                    <span>Active: {vehicles.filter(v => ['moving_loaded', 'boarding', 'approaching_platform'].includes(v.state)).length}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 bg-red-500 rounded-full"></span>
                    <span>Empty: {vehicles.filter(v => v.state === 'idle_empty').length}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 bg-yellow-500 rounded-full"></span>
                    <span>Charging: {chargingPods}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 bg-orange-500 rounded-full"></span>
                    <span>Low Battery: {lowBatteryPods}</span>
                  </div>
                </div>
              </div>

              {/* Most Important Action: Add Pod */}
              {vehicles.length === 0 && Object.values(waitingByStation).some(v => v > 0) && (
                <div className="rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-orange-300 p-3 space-y-2">
                  <div className="font-bold text-sm text-orange-900">🤔 Waiting Groups Detected</div>
                  <div className="text-xs text-orange-800">You have groups waiting but no pods! Open the Add Pod section below to start serving passengers.</div>
                </div>
              )}

              {/* Speed Control */}
              <div className="rounded-lg border border-slate-200 p-3 space-y-2 bg-gradient-to-br from-cyan-50 to-blue-50">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">Pod Speed</div>
                  <span className="font-mono text-sm font-bold text-slate-900">{simSpeedMps.toFixed(1)} m/s</span>
                </div>
                <div className="flex items-center gap-2">
                  <Gauge size={14} className="text-cyan-600" />
                  <input
                    type="range"
                    min={MIN_POD_SPEED_MPS}
                    max={MAX_POD_SPEED_MPS}
                    step="0.5"
                    value={simSpeedMps}
                    onChange={(event) => {
                      const nextSpeed = Number(event.target.value);
                      setSimSpeedMps(nextSpeed);
                      applySpeedToCore(nextSpeed);
                    }}
                    className="w-full h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div className="text-[10px] text-slate-600">Range 5-30 m/s (18-108 km/h)</div>
              </div>
            </div>

            {/* Tabs Navigation */}
            <div className="p-2 border-b border-slate-200 bg-slate-50 flex gap-1 overflow-x-auto">
              <AnalyticsTabButton label="Overview" active={analyticsTab === 'overview'} onClick={() => setAnalyticsTab('overview')} />
              <AnalyticsTabButton label="Pods" active={analyticsTab === 'depot'} onClick={() => setAnalyticsTab('depot')} />
              <AnalyticsTabButton label="Demand" active={analyticsTab === 'demand'} onClick={() => setAnalyticsTab('demand')} />
              <AnalyticsTabButton label="Events" active={analyticsTab === 'ops'} onClick={() => setAnalyticsTab('ops')} />
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
              
              {/* Overview Tab */}
              {analyticsTab === 'overview' && (
                <>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="text-xs font-bold text-slate-600 uppercase tracking-wide">Mean Wait Time</div>
                      <div className="text-3xl font-bold text-slate-900">{simCore.current?.getResults()?.overallMeanWaitSec || 0}s</div>
                      <div className="text-xs text-slate-500">Average time passengers wait</div>
                    </div>

                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
                      <div className="text-xs font-bold text-slate-600 uppercase tracking-wide">Quick Legend</div>
                      <div className="grid grid-cols-1 gap-1.5 text-[10px]">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 bg-red-500 rounded-full"></span>
                          <span className="text-slate-700">Red = Empty / Moving to pick up</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 bg-green-500 rounded-full"></span>
                          <span className="text-slate-700">Green = Carrying passengers</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 bg-yellow-500 rounded-full"></span>
                          <span className="text-slate-700">Yellow = Charging at depot</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 bg-orange-500 rounded-full"></span>
                          <span className="text-slate-700">Orange = Low battery warning</span>
                        </div>
                      </div>
                    </div>

                    <button onClick={handleExportCsv} className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white py-2 text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
                      <FileDown size={16} /> Export Data as CSV
                    </button>
                  </div>
                </>
              )}

              {/* Pods (Depot) Tab */}
              {analyticsTab === 'depot' && (
                <>
                  <div className="rounded-lg border border-blue-300 bg-gradient-to-r from-blue-50 to-cyan-50 p-3 space-y-2">
                    <div className="text-sm font-bold text-blue-900">➕ Add a New Pod</div>
                    <p className="text-xs text-blue-800">Each pod charges fully (100%) before leaving the depot:</p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block mb-1">Pod ID Name</label>
                      <input
                        value={podIdInput}
                        onChange={(event) => setPodIdInput(event.target.value)}
                        className="w-full border-2 border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none"
                        placeholder="e.g., POD-001"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block mb-1">Starting Depot</label>
                      <select
                        value={selectedDepot}
                        onChange={(event) => setSelectedDepot(event.target.value)}
                        className="w-full border-2 border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none"
                      >
                        {(snapshot?.depotIds || []).map(depot => (
                          <option key={depot} value={depot}>{depot}</option>
                        ))}
                      </select>
                    </div>

                    <button onClick={handleAddPod} className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white rounded-lg py-2.5 font-bold text-sm flex items-center justify-center gap-2 transition-all">
                      <Plus size={16} /> Add Pod Now
                    </button>
                  </div>

                  <div className="h-px bg-slate-200"></div>

                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-600 uppercase tracking-wide">Charging Status</div>
                    <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-2">
                      {depotStats.length === 0 && <div className="text-xs text-slate-400">No pods created yet.</div>}
                      {depotStats.map(depot => (
                        <div key={depot.depotId} className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="font-bold text-sm text-slate-800 mb-2">{depot.depotId}</div>
                          {depot.chargingVehicles.length === 0 && depot.parkedVehicles.length === 0 && (
                            <div className="text-xs text-slate-500">No pods.</div>
                          )}
                          {depot.chargingVehicles.map(v => {
                            const pct = Math.max(0, Math.min(100, Math.round(v.battery || 0)));
                            return (
                              <div key={v.id} className="mb-2">
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="font-semibold text-slate-700">{v.id}</span>
                                  <span className="text-amber-700 font-bold">{pct}% charged</span>
                                </div>
                                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-300" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Demand Tab */}
              {analyticsTab === 'demand' && (
                <>
                  <div className="rounded-lg border border-orange-300 bg-gradient-to-r from-orange-50 to-amber-50 p-3">
                    <div className="text-sm font-bold text-orange-900">📊 Set Passenger Demand</div>
                    <p className="text-xs text-orange-800 mt-1">Drag sliders to set expected groups per 30-minute period from each station:</p>
                  </div>

                  <div className="space-y-3">
                    {Object.keys(nodes).filter(id => nodes[id].type === 'station').map(stationId => (
                      <div key={stationId} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-semibold text-slate-800">{stationId}</span>
                          <span className="font-mono bg-slate-100 text-slate-800 px-2 py-1 rounded text-xs font-bold">
                            {simCore.current?.stationDemand?.[stationId] || 0}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="50"
                          value={simCore.current?.stationDemand?.[stationId] || 0}
                          className="w-full h-2.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-cyan-600"
                          onChange={(event) => {
                            if (!simCore.current) return;
                            const newDemand = {
                              ...simCore.current.stationDemand,
                              [stationId]: parseInt(event.target.value, 10),
                            };
                            simCore.current.setStationDemand(newDemand);
                            setSnapshot({ ...simCore.current.getSnapshot() });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Events Tab */}
              {analyticsTab === 'ops' && (
                <>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={logFilter}
                        onChange={(event) => setLogFilter(event.target.value)}
                        className="border-2 border-slate-300 rounded-lg px-2 py-2 text-xs font-semibold focus:border-cyan-500 focus:outline-none"
                      >
                        <option value="all">All Events</option>
                        <option value="dispatch">Dispatch</option>
                        <option value="passenger">Passenger</option>
                        <option value="battery">Battery</option>
                        <option value="scenario">Scenario</option>
                        <option value="system">System</option>
                      </select>
                      <button onClick={exportOperationsLog} className="rounded-lg bg-slate-600 hover:bg-slate-700 text-white py-2 text-xs font-semibold flex items-center justify-center gap-1 transition-colors">
                        <FileDown size={14} /> Export
                      </button>
                    </div>
                    <input
                      value={logSearch}
                      onChange={(event) => setLogSearch(event.target.value)}
                      className="w-full border-2 border-slate-300 rounded-lg px-3 py-2 text-xs focus:border-cyan-500 focus:outline-none"
                      placeholder="Search by pod ID or station..."
                    />
                  </div>

                  <div className="text-[11px] text-slate-600 font-semibold">Showing {operationsFeed.length} recent events</div>

                  <div className="max-h-[28rem] overflow-y-auto custom-scrollbar space-y-1.5">
                    {operationsFeed.length === 0 && (
                      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-center text-sm text-slate-500">
                        No events match the current filter.
                      </div>
                    )}
                    {operationsFeed.map((event, idx) => (
                      <div key={`${event.t}-${event.type}-${idx}`} className="rounded-lg border border-slate-200 bg-white p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs font-bold text-slate-700">
                            [{Math.floor((event.t || 0) / 60).toString().padStart(2, '0')}:{Math.floor((event.t || 0) % 60).toString().padStart(2, '0')}]
                          </span>
                          <span className="uppercase tracking-wider text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">{event.category}</span>
                        </div>
                        <div className="text-xs text-slate-800">{event.message}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

            </div>
          </div>
        )}

      <div className="future-statusbar h-8 border-t bg-gradient-to-r from-slate-100 to-blue-50 flex items-center px-4 text-[12px] font-semibold justify-between z-10 text-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          {simMode === 'edit' ? (
            <>
              <span className="px-3 py-1 rounded-lg bg-blue-600 text-white font-bold text-[10px] tracking-wider">🎨 DESIGN</span>
              <div className="flex items-center gap-2.5 text-slate-700">
                <span className="text-slate-500">Tool:</span>
                <span className="font-mono bg-blue-100 text-blue-900 px-2 py-0.5 rounded">{mode.toUpperCase().replace('_', ' ')}</span>
              </div>
              <span className="text-slate-400">|</span>
              <span className="text-slate-600">{Object.keys(nodes).length} <span className="text-slate-500 text-[10px]">nodes</span></span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-600">{uniqueCorridorCount} <span className="text-slate-500 text-[10px]">links</span></span>
            </>
          ) : (
            <>
              <span className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[10px] tracking-wider">▶ RUNNING</span>
              <span className="text-slate-700">Speed: <span className="font-mono bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded">{simSpeedMps.toFixed(1)} m/s</span></span>
              {report && <span className="text-slate-400">• Seed: <span className="font-mono">{report.seed.substring(0, 8)}</span></span>}
            </>
          )}
        </div>
        {simMode === 'play' && simCore.current && (
          <div className="flex items-center gap-3 text-slate-700">
            <span>⏱️ Wait: <span className="font-bold">{simCore.current?.getResults()?.overallMeanWaitSec || 0}s</span></span>
            <span>|</span>
            <span>✅ Served: <span className="font-bold">{simCore.current?.getResults()?.totalServedGroups || 0}</span></span>
          </div>
        )}
      </div>
      </div>

      {detailedStation && (
        <StationView
          stationId={detailedStation}
          snapshot={snapshot}
          onClose={() => setDetailedStation(null)}
        />
      )}

      {detailedDepot && (
        <DepotView
          depotId={detailedDepot}
          snapshot={snapshot}
          onClose={() => setDetailedDepot(null)}
        />
      )}

      {editingEdge && (
        <div className="absolute top-20 left-20 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-4 w-64 z-50 text-slate-200">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Edit Corridor</h3>
            <button onClick={() => setEditingEdge(null)} className="text-slate-400 hover:text-white"><X size={16} /></button>
          </div>
          <div className="text-[10px] text-slate-400 mb-3 break-words">
            {editingEdge.from} ➔ {editingEdge.to}
          </div>
          <div className="text-[10px] text-cyan-300 mb-2">
            Click any corridor label to edit distance instantly.
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Distance (meters)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={edgeDistanceInput}
                  onChange={(e) => setEdgeDistanceInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                />
              </div>
            </div>
            
            <button 
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white rounded py-1.5 text-[11px] font-bold mt-2 transition-colors"
              onClick={() => {
                const updatedDist = Number(edgeDistanceInput);
                if (!Number.isFinite(updatedDist) || updatedDist <= 0) {
                  alert('Distance must be a positive number in meters.');
                  return;
                }
                setEdges(prev => prev.map(e => {
                  if (e.from === editingEdge.from && e.to === editingEdge.to) {
                    return { ...e, distance: updatedDist };
                  }
                  if (e.from === editingEdge.to && e.to === editingEdge.from) {
                    return { ...e, distance: updatedDist };
                  }
                  return e;
                }));
                setEditingEdge(null);
              }}
            >
              SAVE CORRIDOR
            </button>
            
            <button
               className="w-full bg-slate-700 hover:bg-slate-600 text-white rounded py-1.5 text-[11px] font-bold mt-1 transition-colors"
               onClick={() => {
                  // physical distance
                  const n1 = nodes[editingEdge.from];
                  const n2 = nodes[editingEdge.to];
                  if (n1 && n2) {
                     setEdgeDistanceInput(Math.round(Math.hypot(n2.x - n1.x, n2.y - n1.y)));
                  }
               }}
            >
               RESET TO CANVAS DIST
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolbarButton({ icon, label, onClick, active, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`future-tool-btn flex flex-col items-center justify-center w-14 h-12 rounded-lg transition-all duration-200 ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${active ? 'is-active' : ''}`}
    >
      <div className="mb-0.5">{React.cloneElement(icon, { size: 18 })}</div>
      <span className="text-[9px] font-bold uppercase tracking-wide">{label}</span>
    </button>
  );
}

function AnalyticsTabButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-2 border-2 transition-all text-xs font-semibold ${active
        ? 'bg-cyan-500 text-white border-cyan-600 shadow-md'
        : 'bg-white text-slate-700 border-slate-200 hover:border-cyan-400 hover:text-cyan-600'}`}
    >
      {label}
    </button>
  );
}

function LegendRow({ color, text }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block w-3 h-3 rounded-full ${color}`} />
      <span>{text}</span>
    </div>
  );
}

function KpiCard({ label, value, tone }) {
  const toneMap = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  return (
    <div className={`rounded border px-2 py-1 ${toneMap[tone] || toneMap.slate}`}>
      <div className="uppercase text-[9px] tracking-wide">{label}</div>
      <div className="font-semibold text-[11px]">{value}</div>
    </div>
  );
}

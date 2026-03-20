import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Play, Pause, FastForward, Save, FolderOpen, RefreshCcw,
  MousePointer2, PlusCircle, Building2, Link2, Upload, Database, Plus, X
} from 'lucide-react';
import { UltraSimCore } from './api/ultra-sim-core.js';
import StationView from './components/StationView.jsx';
import DepotView from './components/DepotView.jsx';

const SIM_STEP_SECONDS = 0.15;
const DEFAULT_CURVE = 36;

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

  const [simRunning, setSimRunning] = useState(false);
  const [simMode, setSimMode] = useState('edit');
  const simCore = useRef(null);
  const [snapshot, setSnapshot] = useState(null);

  const [podIdInput, setPodIdInput] = useState('POD-201');
  const [selectedDepot, setSelectedDepot] = useState('');

  // Drag state
  const [draggingNode, setDraggingNode] = useState(null);
  const [draggingEdge, setDraggingEdge] = useState(null);
  const [hoverEdge, setHoverEdge] = useState(null);

  const svgRef = useRef(null);

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
      simCore.current = new UltraSimCore({ nodes, edges });
      const validation = simCore.current.validateNetwork();
      if (!validation.ok) {
        alert(`Network Error:\n${validation.errors.join('\n')}`);
        return;
      }
      setSimMode('play');
      setSnapshot(simCore.current.getSnapshot());
      setSelectedDepot(simCore.current.depotIds[0] || '');
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

  const handleSave = async () => {
    if (!window.electronAPI) {
      alert('Electron IPC not found. Make sure running via desktop mode.');
      return;
    }

    const data = { nodes, edges, stationCounter, depotCounter };
    const success = await window.electronAPI.saveFile(data);
    if (success) alert('Network saved successfully!');
  };

  const handleLoad = async () => {
    if (!window.electronAPI) {
      alert('Electron IPC not found.');
      return;
    }

    const data = await window.electronAPI.openFile();
    if (!data) return;

    handleStop();
    setNodes(data.nodes || {});
    setEdges(normalizeEdges(data.edges || []));
    setStationCounter(data.stationCounter || 1);
    setDepotCounter(data.depotCounter || 1);
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
    if (Object.keys(nodes).length === 0) {
      loadCaseStudy('airport_ring');
    }
  }, []);

  useEffect(() => {
    if (!simRunning || !simCore.current) return;
    const interval = setInterval(() => {
      setSnapshot(simCore.current.step(SIM_STEP_SECONDS));
    }, 50);
    return () => clearInterval(interval);
  }, [simRunning]);

  const vehicles = snapshot?.vehicles || [];
  const waitingByStation = snapshot?.waitingByStation || {};
  const simTime = snapshot ? Math.floor(snapshot.timeSec / 60) : 0;
  const chargingPods = vehicles.filter(v => v.state === 'charging').length;
  const lowBatteryPods = vehicles.filter(v => v.battery < 20).length;
  const criticalBatteryPods = vehicles.filter(v => v.battery < 8).length;
  const recentEvents = (snapshot?.recentEvents || []).slice(-8).reverse();
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
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-800 font-sans select-none">
      <div className="h-8 bg-slate-800 text-slate-300 flex items-center px-4 text-xs font-semibold titlebar shadow" style={{ WebkitAppRegion: 'drag' }}>
        <span>Hermes PRT Simulator - {simMode === 'edit' ? 'Editing Network' : 'Simulation Mode'}</span>
      </div>

      <div className="h-16 bg-white/95 backdrop-blur border-b border-slate-200 flex items-center px-4 justify-between shadow-sm z-10">
        <div className="flex space-x-2 border-r pr-4 border-slate-200 items-center">
          <ToolbarButton icon={<FolderOpen />} label="Open" onClick={handleLoad} disabled={simMode === 'play'} />
          <ToolbarButton icon={<Save />} label="Save" onClick={handleSave} disabled={simMode === 'play'} />
          <ToolbarButton icon={<Database />} label="Case" onClick={() => loadCaseStudy(selectedCaseStudy)} disabled={simMode === 'play'} />
          <ToolbarButton icon={<RefreshCcw />} label="Clear" onClick={() => { setNodes({}); setEdges([]); setStationCounter(1); setDepotCounter(1); }} disabled={simMode === 'play'} />
          <select
            value={selectedCaseStudy}
            onChange={(event) => setSelectedCaseStudy(event.target.value)}
            disabled={simMode === 'play'}
            className="h-8 rounded border border-slate-300 text-xs px-2 text-slate-700 bg-white"
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
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative bg-slate-100">
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
                    if (mode === 'delink') handleDeleteEdge(event, edge);
                  }}
                  onMouseDown={(event) => handleEdgeMouseDown(event, edge)}
                  onMouseUp={handleEdgeMouseUp}
                  onMouseEnter={() => setHoverEdge(edge)}
                  onMouseLeave={() => setHoverEdge(null)}
                  className={mode === 'curve_link' || mode === 'delink' ? 'cursor-pointer' : ''}
                  style={{ opacity: isHovering ? 0.9 : 0.7 }}
                />
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
                <polygon points="0,-16 16,0 0,16 -16,0" fill={draggingNode === node.name || hoverNode === node.name ? '#fde047' : '#facc15'} stroke="#334155" strokeWidth="3" />
              ) : (
                <circle r="12" fill={draggingNode === node.name || hoverNode === node.name ? '#60a5fa' : '#3b82f6'} stroke="#334155" strokeWidth="3" />
              )}
              <text y="24" fontSize="11" fill="#334155" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>{node.name}</text>

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

        {simMode === 'play' && (
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-white border-l border-slate-200 shadow-xl flex flex-col pointer-events-auto z-20">
            <div className="p-4 bg-slate-800 text-white font-semibold text-sm">Simulation Metrics</div>
            <div className="p-4 text-xs font-mono space-y-2 border-b border-slate-200 bg-slate-50">
              <div className="flex justify-between"><span>Time:</span> <span>{Math.floor(simTime / 60).toString().padStart(2, '0')}:{(simTime % 60).toString().padStart(2, '0')}</span></div>
              <div className="flex justify-between"><span>Active Pods:</span> <span>{vehicles.length}</span></div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-[10px]">
                <div className="rounded bg-yellow-100 text-yellow-800 px-2 py-1 text-center">Charging: {chargingPods}</div>
                <div className="rounded bg-orange-100 text-orange-800 px-2 py-1 text-center">Low: {lowBatteryPods}</div>
                <div className="rounded bg-red-100 text-red-800 px-2 py-1 text-center">Critical: {criticalBatteryPods}</div>
              </div>
            </div>

            <div className="p-4 border-b border-slate-200 bg-slate-50 space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Add Pod At Depot</h3>
              <input
                value={podIdInput}
                onChange={(event) => setPodIdInput(event.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                placeholder="Unique pod ID"
              />
              <select
                value={selectedDepot}
                onChange={(event) => setSelectedDepot(event.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
              >
                {(snapshot?.depotIds || []).map(depot => (
                  <option key={depot} value={depot}>{depot}</option>
                ))}
              </select>
              <button onClick={handleAddPod} className="w-full bg-blue-600 hover:bg-blue-700 transition-colors text-white rounded text-xs py-1.5 flex items-center justify-center gap-1">
                <Plus size={14} /> Add Pod
              </button>
            </div>

            <div className="p-4 border-b border-slate-200 bg-white space-y-2 text-xs">
              <h3 className="font-bold text-slate-500 uppercase tracking-wider">Color Legend</h3>
              <LegendRow color="bg-red-500" text="Red: Empty / Repositioning" />
              <LegendRow color="bg-green-500" text="Green: Boarding / Loaded / Docking" />
              <LegendRow color="bg-blue-500" text="Blue: Unloading" />
              <LegendRow color="bg-slate-400" text="Grey: Waiting slot" />
              <LegendRow color="bg-yellow-500" text="Yellow: Charging at depot" />
            </div>

            <div className="p-4 border-b border-slate-200 bg-slate-50 space-y-2 text-xs">
              <h3 className="font-bold text-slate-500 uppercase tracking-wider">Battery & Charge Events</h3>
              <div className="max-h-28 overflow-y-auto custom-scrollbar space-y-1">
                {recentEvents.length === 0 && <div className="text-slate-400">No recent events.</div>}
                {recentEvents.map((event, idx) => {
                  const isChargeEvent = ['low_battery_route_to_depot', 'charging_started', 'charging_complete'].includes(event.type);
                  if (!isChargeEvent) return null;
                  const minute = Math.floor((event.t || 0) / 60).toString().padStart(2, '0');
                  const second = Math.floor((event.t || 0) % 60).toString().padStart(2, '0');
                  return (
                    <div key={`${event.type}-${event.vehicleId}-${event.t}-${idx}`} className="rounded border border-slate-200 bg-white px-2 py-1">
                      <div className="font-semibold text-slate-700">[{minute}:{second}] {event.vehicleId}</div>
                      {event.type === 'low_battery_route_to_depot' && (
                        <div className="text-orange-700">Low battery {event.battery}% → routing to {event.depot}</div>
                      )}
                      {event.type === 'charging_started' && (
                        <div className="text-yellow-700">Started charging at {event.depot} ({event.battery}%)</div>
                      )}
                      {event.type === 'charging_complete' && (
                        <div className="text-emerald-700">Charging complete at {event.depot} ({event.battery}%)</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-b border-slate-200 bg-white space-y-2 text-xs">
              <h3 className="font-bold text-slate-500 uppercase tracking-wider">Depot Inner Working</h3>
              <div className="max-h-44 overflow-y-auto custom-scrollbar space-y-2">
                {depotStats.map(depot => (
                  <div key={depot.depotId} className="rounded border border-slate-200 bg-slate-50 p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">{depot.depotId}</span>
                      <span className="text-[10px] text-slate-500">parked {depot.parkedVehicles.length}</span>
                    </div>

                    <div className="flex gap-1 text-[10px]">
                      <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5">Charging {depot.chargingVehicles.length}</span>
                      <span className="rounded bg-blue-100 text-blue-800 px-1.5 py-0.5">Inbound {depot.inboundChargeVehicles.length}</span>
                    </div>

                    {depot.chargingVehicles.length === 0 && (
                      <div className="text-[10px] text-slate-400">No pod charging right now.</div>
                    )}

                    {depot.chargingVehicles.map(v => {
                      const pct = Math.max(0, Math.min(100, Math.round(v.battery || 0)));
                      return (
                        <div key={v.id} className="rounded bg-white border border-slate-200 p-1.5">
                          <div className="flex items-center justify-between text-[10px] mb-1">
                            <span className="font-semibold text-slate-700">{v.id}</span>
                            <span className="text-amber-700">{pct}%</span>
                          </div>
                          <div className="h-1.5 bg-slate-200 rounded overflow-hidden">
                            <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="text-[9px] text-slate-500 mt-1">Leaves depot only at 100%</div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Station Demand</h3>
              {Object.keys(nodes).filter(id => nodes[id].type === 'station').map(stationId => (
                <div key={stationId} className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span className="font-semibold">{stationId}</span>
                    <span>{(simCore.current?.stationDemand?.[stationId] || 0) * 10}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    defaultValue={simCore.current?.stationDemand?.[stationId] || 1}
                    className="w-full h-1 bg-slate-300 rounded-lg appearance-none cursor-pointer"
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
          </div>
        )}
      </div>

      <div className="h-6 bg-slate-200 border-t border-slate-300 flex items-center px-4 text-[10px] text-slate-500 font-semibold justify-between z-10">
        <div>
          {simMode === 'edit'
            ? `EDIT MODE | Tool: ${mode.toUpperCase()} | Nodes: ${Object.keys(nodes).length} | Corridors: ${uniqueCorridorCount} (2-way)`
            : 'SIMULATION RUNNING'}
        </div>
        {simMode === 'play' && <div>Wait Avg: {simCore.current?.getResults()?.overallMeanWaitSec}s | Serviced: {simCore.current?.getResults()?.totalServedGroups}</div>}
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
    </div>
  );
}

function ToolbarButton({ icon, label, onClick, active, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center w-14 h-12 rounded-lg transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100'} ${active ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-500/50' : 'text-slate-600'}`}
    >
      <div className="mb-0.5">{React.cloneElement(icon, { size: 18 })}</div>
      <span className="text-[9px] font-bold uppercase tracking-wide">{label}</span>
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

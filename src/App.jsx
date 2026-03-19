import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, FastForward, Save, FolderOpen, RefreshCcw, 
  MousePointer2, PlusCircle, Building2, Link2, Download, Upload
} from 'lucide-react';
import { UltraSimCore } from './api/ultra-sim-core.js';
import StationView from './components/StationView.jsx';

export default function App() {
  const [nodes, setNodes] = useState({});
  const [edges, setEdges] = useState([]);
  
  // Editor State
  const [mode, setMode] = useState('select'); // select, add_station, add_depot, add_link
  const [hoverNode, setHoverNode] = useState(null);
  const [linkStart, setLinkStart] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [stationCounter, setStationCounter] = useState(1);
  const [depotCounter, setDepotCounter] = useState(1);
  const [detailedStation, setDetailedStation] = useState(null);

  // Simulation State
  const [simRunning, setSimRunning] = useState(false);
  const [simMode, setSimMode] = useState('edit'); // edit or play
  const simCore = useRef(null);
  const [snapshot, setSnapshot] = useState(null);

  const svgRef = useRef(null);

  // Handle Mouse Move for drawing temp lines
  const handleMouseMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  // Handle Canvas Click
  const handleCanvasClick = () => {
    if (simMode !== 'edit') return;
    
    if (mode === 'add_station') {
      const name = `Station ${stationCounter}`;
      setNodes(prev => ({ ...prev, [name]: { x: mousePos.x, y: mousePos.y, name, type: 'station' } }));
      setStationCounter(c => c + 1);
    } else if (mode === 'add_depot') {
      const name = `Depot ${depotCounter}`;
      setNodes(prev => ({ ...prev, [name]: { x: mousePos.x, y: mousePos.y, name, type: 'depot' } }));
      setDepotCounter(c => c + 1);
    } else if (mode === 'add_link') {
      // clicking empty canvas cancels link start
      setLinkStart(null);
    }
  };

  // Handle Node Click
  const handleNodeClick = (e, nodeName) => {
    e.stopPropagation();
    if (simMode === 'play') {
       if (nodes[nodeName]?.type === 'station') {
          setDetailedStation(nodeName);
       }
       return;
    }
    if (simMode !== 'edit') return;

    if (mode === 'add_link') {
      if (!linkStart) {
        setLinkStart(nodeName);
      } else {
        if (linkStart !== nodeName) {
          // Add edge
          const isDuplicate = edges.some(edge => edge[0] === linkStart && edge[1] === nodeName);
          if (!isDuplicate) setEdges(prev => [...prev, [linkStart, nodeName]]);
        }
        setLinkStart(null);
      }
    } else if (mode === 'select') {
      // Could allow dragging nodes or deleting, but we keep it simple
    }
  };

  // Start Simulation
  const handlePlay = () => {
    if (simMode === 'edit') {
      simCore.current = new UltraSimCore({ nodes, edges });
      const val = simCore.current.validateNetwork();
      if (!val.ok) {
        alert("Network Error:\n" + val.errors.join('\n'));
        return;
      }
      setSimMode('play');
      setSnapshot(simCore.current.getSnapshot());
    }
    setSimRunning(prev => !prev);
  };

  const handleStop = () => {
    setSimRunning(false);
    setSimMode('edit');
    simCore.current = null;
    setSnapshot(null);
  };

  const handleFastForward = () => {
    if (simCore.current) {
      simCore.current.runFastForward(60); // 1 hour
      setSnapshot(simCore.current.getSnapshot());
    }
  };

  // File I/O via Electron IPC
  const handleSave = async () => {
    if (window.electronAPI) {
      const data = { nodes, edges, stationCounter, depotCounter };
      const success = await window.electronAPI.saveFile(data);
      if (success) alert('Network saved successfully!');
    } else {
      alert("Electron IPC not found. Make sure running via desktop mode.");
    }
  };

  const handleLoad = async () => {
    if (window.electronAPI) {
      const data = await window.electronAPI.openFile();
      if (data) {
        handleStop();
        setNodes(data.nodes || {});
        setEdges(data.edges || []);
        setStationCounter(data.stationCounter || 1);
        setDepotCounter(data.depotCounter || 1);
      }
    } else {
      alert("Electron IPC not found.");
    }
  };

  const handleDemo = () => {
    setNodes({
      "Station A": { x: 200, y: 300, name: "Station A", type: 'station' },
      "Station B": { x: 600, y: 300, name: "Station B", type: 'station' },
      "Central Depot": { x: 400, y: 150, name: "Central Depot", type: 'depot' }
    });
    setEdges([["Station A", "Central Depot"], ["Central Depot", "Station B"], ["Station B", "Station A"]]);
    setStationCounter(3);
    setDepotCounter(2);
  };

  // Simulation Loop
  useEffect(() => {
    if (!simRunning || !simCore.current) return;
    const interval = setInterval(() => {
      setSnapshot(simCore.current.step(2));
    }, 50);
    return () => clearInterval(interval);
  }, [simRunning]);

  const vehicles = snapshot?.vehicles || [];
  const waitingByStation = snapshot?.waitingByStation || {};
  const simTime = snapshot ? Math.floor(snapshot.timeSec / 60) : 0;

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans select-none">
      {/* Title Bar - Simulating Native OS Feel */}
      <div className="h-8 bg-slate-800 text-slate-300 flex items-center px-4 text-xs font-semibold titlebar" style={{ WebkitAppRegion: 'drag' }}>
        <span>Hermes PRT Simulator - {simMode === 'edit' ? 'Editing Network' : 'Simulation Mode'}</span>
      </div>

      {/* Main Toolbar */}
      <div className="h-16 bg-white border-b border-slate-200 flex items-center px-4 justify-between shadow-sm z-10">
        <div className="flex space-x-2 border-r pr-4 border-slate-200">
          <ToolbarButton icon={<FolderOpen />} label="Open" onClick={handleLoad} disabled={simMode === 'play'} />
          <ToolbarButton icon={<Save />} label="Save" onClick={handleSave} disabled={simMode === 'play'} />
          <ToolbarButton icon={<Play />} label="Demo" onClick={handleDemo} disabled={simMode === 'play'} />
          <ToolbarButton icon={<RefreshCcw />} label="Clear" onClick={() => { setNodes({}); setEdges([]); setStationCounter(1); setDepotCounter(1); }} disabled={simMode === 'play'} />
        </div>
        
        <div className="flex space-x-2 border-r pr-4 border-slate-200 pl-4">
          <ToolbarButton icon={<MousePointer2 />} label="Select" active={mode === 'select'} onClick={() => setMode('select')} disabled={simMode === 'play'} />
          <ToolbarButton icon={<PlusCircle />} label="Station" active={mode === 'add_station'} onClick={() => setMode('add_station')} disabled={simMode === 'play'} />
          <ToolbarButton icon={<Building2 />} label="Depot" active={mode === 'add_depot'} onClick={() => setMode('add_depot')} disabled={simMode === 'play'} />
          <ToolbarButton icon={<Link2 />} label="Link" active={mode === 'add_link'} onClick={() => setMode('add_link')} disabled={simMode === 'play'} />
        </div>

        <div className="flex space-x-2 pl-4">
          <ToolbarButton icon={simRunning ? <Pause className="text-amber-500" /> : <Play className="text-emerald-500" />} label={simRunning ? "Pause" : "Run"} onClick={handlePlay} />
          {simMode === 'play' && <ToolbarButton icon={<RefreshCcw />} label="Stop" onClick={handleStop} />}
          <ToolbarButton icon={<FastForward className="text-blue-500" />} label="Forward" onClick={handleFastForward} disabled={simMode === 'edit'} />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative bg-slate-100">
        {/* Workspace Grid Canvas */}
        <svg 
          ref={svgRef}
          className="w-full h-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onClick={handleCanvasClick}
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
            </pattern>
            <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Edges */}
          {edges.map((edge, i) => {
            const n1 = nodes[edge[0]];
            const n2 = nodes[edge[1]];
            if (!n1 || !n2) return null;
            return <line key={i} x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} stroke="#64748b" strokeWidth="4" markerEnd="url(#arrow)" />;
          })}

          {/* Temp Drawing Edge */}
          {mode === 'add_link' && linkStart && nodes[linkStart] && (
            <line x1={nodes[linkStart].x} y1={nodes[linkStart].y} x2={mousePos.x} y2={mousePos.y} stroke="#3b82f6" strokeWidth="4" strokeDasharray="5,5" markerEnd="url(#arrow)" />
          )}

          {/* Nodes */}
          {Object.values(nodes).map(node => (
            <g 
              key={node.name} 
              transform={`translate(${node.x}, ${node.y})`}
              onMouseEnter={() => setHoverNode(node.name)}
              onMouseLeave={() => setHoverNode(null)}
              onClick={(e) => handleNodeClick(e, node.name)}
              className="cursor-pointer"
            >
              {node.type === 'depot' ? (
                <polygon points="0,-16 16,0 0,16 -16,0" fill={hoverNode === node.name ? '#fde047' : '#facc15'} stroke="#334155" strokeWidth="3" />
              ) : (
                <circle r="12" fill={hoverNode === node.name ? '#60a5fa' : '#3b82f6'} stroke="#334155" strokeWidth="3" />
              )}
              <text y="24" fontSize="11" fill="#334155" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>{node.name}</text>
              
              {/* Draw wait queue indicators if playing */}
              {simMode === 'play' && node.type === 'station' && waitingByStation[node.name] > 0 && (
                <g transform="translate(12, -18)">
                  <circle r="8" fill="#ef4444" />
                  <text y="3" fontSize="9" fill="white" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>{waitingByStation[node.name]}</text>
                </g>
              )}
            </g>
          ))}

          {/* Vehicles */}
          {vehicles.map(v => {
            if (v.state === 'idle_empty' && !v.nextNode) return null; // Avoid clutter
            const n1 = nodes[v.node];
            const n2 = nodes[v.nextNode] || n1;
            if (!n1 || !n2) return null;

            const progress = v.edgeTravelSec > 0 ? v.edgeProgressSec / v.edgeTravelSec : 0;
            const x = n1.x + (n2.x - n1.x) * progress;
            const y = n1.y + (n2.y - n1.y) * progress;

            let color = '#ef4444'; // Red (empty/repositioning)
            if (v.state === 'boarding' || v.state === 'moving_loaded') color = '#22c55e'; // Green
            else if (v.state === 'unloading') color = '#3b82f6'; // Blue
            else if (v.state === 'waiting_slot') color = '#94a3b8'; // Grey

            return (
              <g key={v.id} transform={`translate(${x}, ${y})`}>
                <circle r="6" fill={color} stroke="#1e293b" strokeWidth="2" />
                <rect x="-8" y="-14" width="16" height="8" rx="2" fill="#1e293b" />
                <text y="-8" fontSize="6" fill="white" fontWeight="bold" textAnchor="middle">{v.id.replace('V', '')}</text>
              </g>
            );
          })}
        </svg>

        {/* Right Sidebar - Demand sliders & Stats */}
        {simMode === 'play' && (
          <div className="absolute right-0 top-0 bottom-0 w-64 bg-white border-l border-slate-200 shadow-xl flex flex-col pointer-events-auto z-20">
            <div className="p-4 bg-slate-800 text-white font-semibold text-sm">Simulation Metrics</div>
            <div className="p-4 text-xs font-mono space-y-2 border-b border-slate-200 bg-slate-50">
              <div className="flex justify-between"><span>Time:</span> <span>{Math.floor(simTime / 60).toString().padStart(2, '0')}:{(simTime % 60).toString().padStart(2, '0')}</span></div>
              <div className="flex justify-between"><span>Active Vehicles:</span> <span>{vehicles.length}</span></div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Station Demand</h3>
              {Object.keys(nodes).filter(k => nodes[k].type === 'station').map(station => (
                <div key={station} className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span className="font-semibold">{station}</span>
                    <span>{simCore.current.stationDemand[station] * 10}%</span>
                  </div>
                  <input type="range" min="0" max="10" defaultValue={simCore.current.stationDemand[station]} className="w-full h-1 bg-slate-300 rounded-lg appearance-none cursor-pointer" onChange={(e) => {
                     const newDemand = { ...simCore.current.stationDemand, [station]: parseInt(e.target.value) };
                     simCore.current.setStationDemand(newDemand);
                     setSnapshot({...simCore.current.getSnapshot()});
                  }}/>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="h-6 bg-slate-200 border-t border-slate-300 flex items-center px-4 text-[10px] text-slate-500 font-semibold justify-between z-10">
        <div>{simMode === 'edit' ? `EDIT MODE | Tool: ${mode.toUpperCase()} | Nodes: ${Object.keys(nodes).length} | Edges: ${edges.length}` : `SIMULATION RUNNING`}</div>
        {simMode === 'play' && <div>Wait Avg: {simCore.current?.getResults()?.overallMeanWaitSec}s | Serviced: {simCore.current?.getResults()?.totalServedGroups}</div>}
      </div>
      {detailedStation && (
        <StationView 
          stationId={detailedStation} 
          snapshot={snapshot} 
          onClose={() => setDetailedStation(null)} 
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

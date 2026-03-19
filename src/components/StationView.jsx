import React, { useState, useEffect } from 'react';
import { X, Battery, Gauge, User, MapPin } from 'lucide-react';

export default function StationView({ stationId, snapshot, onClose }) {
  if (!snapshot) return null;

  const vehicles = snapshot.vehicles || [];
  const waitingNow = snapshot.waitingByStation?.[stationId] || 0;

  // Filter vehicles currently at this node or arriving/leaving
  const localVehicles = vehicles.filter(v => v.node === stationId || v.nextNode === stationId);
  
  // Assign stable berths to vehicles completely stopped at station
  // In a real integration, the core handles this. We synthesize it visually for demonstration.
  const stoppedVehicles = localVehicles.filter(v => ['idle_empty', 'boarding', 'unloading', 'waiting_slot'].includes(v.state) && v.node === stationId);
  const arrivingVehicles = localVehicles.filter(v => !stoppedVehicles.includes(v) && v.nextNode === stationId);

  return (
    <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-8 transition-all animate-fade-in">
      <div className="w-full max-w-5xl h-full max-h-[800px] bg-slate-800 rounded-3xl border border-slate-600 shadow-2xl flex flex-col overflow-hidden relative">
        
        <div className="h-16 border-b border-slate-700 flex items-center justify-between px-6 bg-slate-800/50">
          <div className="flex items-center space-x-3">
            <h2 className="text-2xl font-bold text-white">Micro-Simulation: {stationId}</h2>
            <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-bold border border-blue-500/30">LIVE TELEMETRY</span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Main Visualizer (Micro-Map) */}
          <div className="flex-1 relative bg-slate-900 p-8 border-r border-slate-700 flex justify-center items-center overflow-hidden">
             {/* Station Diagram */}
             <div className="w-full h-full max-w-2xl relative">
                <svg width="100%" height="100%" viewBox="0 0 800 600" className="bg-[#0f172a] rounded-xl border border-slate-800 shadow-inner">
                   {/* Main Through Line */}
                   <rect x="0" y="100" width="800" height="20" fill="#1e293b" />
                   <line x1="0" y1="110" x2="800" y2="110" stroke="#334155" strokeWidth="2" strokeDasharray="10,5" />
                   
                   {/* Deceleration Lane */}
                   <path d="M 200 120 C 300 120, 250 250, 350 250" fill="none" stroke="#1e293b" strokeWidth="20" />
                   <path d="M 200 120 C 300 120, 250 250, 350 250" fill="none" stroke="#334155" strokeWidth="2" strokeDasharray="10,5" />

                   {/* Platform Siding (Berths) */}
                   <rect x="340" y="240" width="220" height="20" fill="#1e293b" />
                   <rect x="340" y="260" width="220" height="40" fill="#334155" /> {/* Platform */}
                   <text x="450" y="285" fill="#94a3b8" fontSize="16" fontWeight="bold" textAnchor="middle" letterSpacing="4">PASSENGER PLATFORM</text>

                   {/* Acceleration Lane */}
                   <path d="M 550 250 C 650 250, 600 120, 700 120" fill="none" stroke="#1e293b" strokeWidth="20" />
                   <path d="M 550 250 C 650 250, 600 120, 700 120" fill="none" stroke="#334155" strokeWidth="2" strokeDasharray="10,5" />

                   {/* Draw 5 Berth Slots */}
                   {[0,1,2,3,4].map(i => (
                      <g key={i} transform={`translate(${360 + i * 40}, 240)`}>
                          <rect x="0" y="0" width="20" height="20" fill="none" stroke="#475569" strokeWidth="1" strokeDasharray="2,2"/>
                          <text x="10" y="-5" fill="#64748b" fontSize="8" textAnchor="middle">B{i+1}</text>
                      </g>
                   ))}

                   {/* Render Vehicles */}
                   {/* Inbound Vehicles */}
                   {arrivingVehicles.map((v, idx) => {
                      const prog = v.edgeTravelSec > 0 ? (v.edgeProgressSec / v.edgeTravelSec) : 0;
                      // Animate on main track based on edge progress
                      const x = prog * 200; // rough visual approximation of approach
                      let color = '#22c55e'; // Green moving
                      if (v.state === 'repositioning') color = '#ef4444'; // Red empty
                      return (
                         <g key={v.id} transform={`translate(${x}, 110)`}>
                            <circle r="8" fill={color} stroke="#fff" strokeWidth="2"/>
                            <text y="20" fill="white" fontSize="10">{v.id}</text>
                         </g>
                      )
                   })}

                   {/* Stopped Vehicles in Berths */}
                   {stoppedVehicles.map((v, i) => {
                      const color = v.state === 'idle_empty' ? '#ef4444' : v.state === 'unloading' ? '#3b82f6' : v.state === 'waiting_slot' ? '#94a3b8' : '#22c55e';
                      const bx = 360 + Math.min(i, 4) * 40 + 10;
                      const by = 250;
                      return (
                         <g key={v.id} transform={`translate(${bx}, ${by})`}>
                            {/* Pod Body */}
                            <rect x="-12" y="-6" width="24" height="12" rx="4" fill={color} stroke="#fff" strokeWidth="2"/>
                            <text y="15" fill="white" fontSize="9" textAnchor="middle" fontWeight="bold">{v.id}</text>
                            
                            {/* Visual Action Indicators */}
                            {v.state === 'unloading' && <path d="M 0 -10 L 0 -20 M -5 -15 L 0 -20 L 5 -15" stroke="#60a5fa" strokeWidth="2" fill="none" className="animate-bounce" />}
                            {v.state === 'boarding' && <path d="M 0 -20 L 0 -10 M -5 -15 L 0 -10 L 5 -15" stroke="#4ade80" strokeWidth="2" fill="none" className="animate-bounce" />}
                         </g>
                      )
                   })}
                </svg>
             </div>
          </div>

          {/* Telemetry Sidebar */}
          <div className="w-96 bg-slate-800 p-6 flex flex-col border-l border-slate-700 overflow-y-auto">
             <div className="mb-6 bg-slate-900 border border-slate-700 rounded-xl p-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Station Queue</h3>
                <div className="flex justify-between items-end">
                   <div className="text-4xl font-bold text-white">{waitingNow}</div>
                   <div className="text-sm text-slate-500 mb-1">passengers</div>
                </div>
             </div>

             <h3 className="text-xs font-bold text-slate-400 uppercase mb-4">Pod Manifest & Telemetry</h3>
             <div className="space-y-4">
                {localVehicles.length === 0 && <div className="text-sm text-slate-500 italic">No pods currently in sector.</div>}
                
                {localVehicles.map(v => (
                   <div key={v.id} className="bg-slate-700/30 rounded-xl border border-slate-700 p-4 relative overflow-hidden group hover:border-slate-500 transition-colors">
                      <div className="flex justify-between items-center mb-3">
                         <div className="flex items-center space-x-2">
                            <span className="text-white font-bold">{v.id}</span>
                            <span className="px-2 py-0.5 bg-slate-800 rounded text-[10px] text-slate-300 font-mono uppercase">{v.state.replace('_', ' ')}</span>
                         </div>
                         <div className="text-xs text-slate-400 font-mono">
                            {v.node === stationId ? "At Station" : "Inbound"}
                         </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                         <div className="bg-slate-900/50 p-2 rounded-lg flex items-center">
                            <Battery size={16} className={v.battery < 20 ? 'text-red-400 mr-2' : v.battery < 50 ? 'text-amber-400 mr-2' : 'text-emerald-400 mr-2'} />
                            <div>
                               <div className="text-sm text-white font-mono">{v.battery ? v.battery.toFixed(1) : '100.0'}%</div>
                               <div className="text-[9px] text-slate-500">P-CELL</div>
                            </div>
                         </div>
                         
                         <div className="bg-slate-900/50 p-2 rounded-lg flex items-center">
                            <Gauge size={16} className="text-blue-400 mr-2" />
                            <div>
                               <div className="text-sm text-white font-mono">{v.speedMps ? v.speedMps.toFixed(1) : '0.0'} m/s</div>
                               <div className="text-[9px] text-slate-500">VELOCITY</div>
                            </div>
                         </div>
                      </div>

                      {v.passenger && (
                         <div className="mt-3 bg-blue-900/20 border border-blue-500/20 p-2 rounded-lg flex justify-between items-center">
                            <div className="flex items-center">
                               <User size={14} className="text-blue-400 mr-1.5" />
                               <span className="text-xs text-blue-100">{v.passenger.id}</span>
                            </div>
                            <div className="flex items-center">
                               <span className="text-[10px] text-slate-400 mr-1">Dest:</span>
                               <span className="text-xs font-bold text-white">{v.passenger.dest}</span>
                            </div>
                         </div>
                      )}
                   </div>
                ))}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

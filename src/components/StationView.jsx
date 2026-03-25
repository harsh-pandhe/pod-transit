import React from 'react';
import { X, Battery, Gauge, Users, MapPin } from 'lucide-react';

function vehicleColor(vehicle) {
  if (['boarding', 'moving_loaded', 'approaching_platform', 'docking'].includes(vehicle.state)) return '#22c55e';
  if (vehicle.state === 'unloading') return '#3b82f6';
  if (vehicle.state === 'waiting_slot') return '#94a3b8';
  if (vehicle.state === 'charging') return '#eab308';
  return '#ef4444';
}

export default function StationView({ stationId, snapshot, onClose }) {
  if (!snapshot) return null;

  const vehicles = snapshot.vehicles || [];
  const waitingNow = snapshot.waitingByStation?.[stationId] || 0;

  const localVehicles = vehicles.filter(vehicle => vehicle.node === stationId || vehicle.nextNode === stationId);
  const berthPods = localVehicles.filter(vehicle => vehicle.node === stationId && ['approaching_platform', 'docking', 'boarding', 'unloading', 'waiting_slot', 'idle_empty'].includes(vehicle.state));
  const inboundPods = localVehicles.filter(vehicle => vehicle.nextNode === stationId && !berthPods.includes(vehicle));

  const nextLanePods = inboundPods.filter(vehicle => vehicle.direction === 'next');
  const prevLanePods = inboundPods.filter(vehicle => vehicle.direction !== 'next');
  const stationEvents = (snapshot.recentEvents || [])
    .filter(event => {
      if (event.stationId === stationId || event.from === stationId || event.to === stationId) return true;
      if (!event.vehicleId) return false;
      return localVehicles.some(vehicle => vehicle.id === event.vehicleId);
    })
    .slice(-8)
    .reverse();

  return (
    <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-8">
      <div className="w-full max-w-6xl h-full max-h-[820px] bg-slate-800 rounded-3xl border border-slate-600 shadow-2xl flex flex-col overflow-hidden relative">
        <div className="h-16 border-b border-slate-700 flex items-center justify-between px-6 bg-slate-800/50">
          <div className="flex items-center space-x-3">
            <h2 className="text-2xl font-bold text-white">Station View: {stationId}</h2>
            <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-bold border border-blue-500/30">LIVE TRACKING</span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 relative bg-slate-900 p-8 border-r border-slate-700 flex justify-center items-center overflow-hidden">
            <div className="w-full h-full max-w-3xl relative">
              <svg width="100%" height="100%" viewBox="0 0 900 620" className="bg-slate-950 rounded-xl border border-slate-800 shadow-inner">
                <rect x="60" y="90" width="780" height="18" fill="#1e293b" />
                <rect x="60" y="140" width="780" height="18" fill="#0f172a" />
                <text x="70" y="84" fill="#94a3b8" fontSize="12">Next station lane</text>
                <text x="70" y="134" fill="#94a3b8" fontSize="12">Previous station lane</text>

                <path d="M 270 108 C 340 108, 320 250, 390 250" fill="none" stroke="#1e293b" strokeWidth="14" />
                <path d="M 270 158 C 340 158, 320 300, 390 300" fill="none" stroke="#0f172a" strokeWidth="14" />

                <rect x="385" y="240" width="290" height="70" fill="#334155" rx="6" />
                <text x="530" y="284" fill="#e2e8f0" fontSize="16" fontWeight="bold" textAnchor="middle">Passenger Platform Zone</text>

                {[1, 2, 3, 4, 5].map(platform => (
                  <g key={platform} transform={`translate(${420 + (platform - 1) * 50}, 220)`}>
                    <rect x="0" y="0" width="30" height="20" fill="none" stroke="#64748b" strokeWidth="1" strokeDasharray="2,2" />
                    <text x="15" y="-5" fill="#64748b" fontSize="10" textAnchor="middle">P{platform}</text>
                  </g>
                ))}

                {nextLanePods.map((vehicle, index) => {
                  const x = 90 + (index * 55) % 700;
                  return (
                    <g key={vehicle.id} transform={`translate(${x}, 98)`}>
                      <circle r="9" fill={vehicleColor(vehicle)} stroke="#fff" strokeWidth="1.5" />
                      <text y="22" fill="white" fontSize="10" textAnchor="middle">{vehicle.id}</text>
                    </g>
                  );
                })}

                {prevLanePods.map((vehicle, index) => {
                  const x = 810 - ((index * 55) % 700);
                  return (
                    <g key={vehicle.id} transform={`translate(${x}, 148)`}>
                      <circle r="9" fill={vehicleColor(vehicle)} stroke="#fff" strokeWidth="1.5" />
                      <text y="22" fill="white" fontSize="10" textAnchor="middle">{vehicle.id}</text>
                    </g>
                  );
                })}

                {berthPods.slice(0, 5).map((vehicle, index) => {
                  const px = 435 + index * 50;
                  const py = 250;
                  const passengers = vehicle.passenger?.groupSize || 0;
                  return (
                    <g key={vehicle.id} transform={`translate(${px}, ${py})`}>
                      <rect x="-14" y="-8" width="28" height="16" rx="4" fill={vehicleColor(vehicle)} stroke="#fff" strokeWidth="1.5" />
                      <text y="18" fill="white" fontSize="9" textAnchor="middle" fontWeight="bold">{vehicle.id}</text>
                      <text y="30" fill="#cbd5e1" fontSize="8" textAnchor="middle">Dock: P{vehicle.targetPlatform || index + 1}</text>
                      <text y="40" fill="#94a3b8" fontSize="8" textAnchor="middle">{passengers}/6 pax</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          <div className="w-96 bg-slate-800 p-6 flex flex-col border-l border-slate-700 overflow-y-auto">
            <div className="mb-6 bg-slate-900 border border-slate-700 rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Station Queue</h3>
              <div className="flex justify-between items-end">
                <div className="text-4xl font-bold text-white">{waitingNow}</div>
                <div className="text-sm text-slate-500 mb-1">groups waiting</div>
              </div>
            </div>

            <h3 className="text-xs font-bold text-slate-400 uppercase mb-4">Pod Actions</h3>
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">Station Decision Feed</h4>
                <div className="max-h-28 overflow-y-auto space-y-1">
                  {stationEvents.length === 0 && <div className="text-[11px] text-slate-500">No local dispatch/docking events yet.</div>}
                  {stationEvents.map((event, index) => {
                    const mm = Math.floor((event.t || 0) / 60).toString().padStart(2, '0');
                    const ss = Math.floor((event.t || 0) % 60).toString().padStart(2, '0');
                    return (
                      <div key={`${event.type}-${event.vehicleId || 'na'}-${event.t}-${index}`} className="text-[10px] text-slate-200 bg-slate-800 rounded px-2 py-1">
                        [{mm}:{ss}] {(event.type || 'event').replaceAll('_', ' ')} {event.vehicleId ? `| ${event.vehicleId}` : ''}
                      </div>
                    );
                  })}
                </div>
              </div>

              {localVehicles.length === 0 && <div className="text-sm text-slate-500 italic">No pods currently around this station.</div>}

              {localVehicles.map(vehicle => (
                <div key={vehicle.id} className="bg-slate-700/30 rounded-xl border border-slate-700 p-4">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-white font-bold">{vehicle.id}</span>
                      <span className="px-2 py-0.5 bg-slate-800 rounded text-[10px] text-slate-300 font-mono uppercase">{vehicle.state.replaceAll('_', ' ')}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">Platform {vehicle.targetPlatform || '-'}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-slate-900/50 p-2 rounded-lg flex items-center">
                      <Battery size={15} className={vehicle.battery < 30 ? 'text-red-400 mr-2' : vehicle.battery < 50 ? 'text-amber-400 mr-2' : 'text-emerald-400 mr-2'} />
                      <div>
                        <div className="text-sm text-white font-mono">{vehicle.battery.toFixed(1)}%</div>
                        <div className="text-[9px] text-slate-500">Battery</div>
                      </div>
                    </div>

                    <div className="bg-slate-900/50 p-2 rounded-lg flex items-center">
                      <Gauge size={15} className="text-blue-400 mr-2" />
                      <div>
                        <div className="text-sm text-white font-mono">{vehicle.speedMps.toFixed(1)} m/s</div>
                        <div className="text-[9px] text-slate-500">Speed</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center text-slate-300 gap-2">
                      <Users size={13} className="text-green-400" />
                      <span>Onboard: {vehicle.passenger?.groupSize || 0}/6</span>
                    </div>
                    <div className="flex items-center text-slate-300 gap-2">
                      <MapPin size={13} className="text-blue-400" />
                      <span>Route: {(vehicle.selectedRoute || []).slice(0, 4).join(' → ') || 'Awaiting assignment'}</span>
                    </div>
                    <div className="text-slate-400">Destination: {vehicle.passenger?.dest || '-'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

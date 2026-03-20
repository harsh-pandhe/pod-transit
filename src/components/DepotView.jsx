import React, { useMemo } from 'react';
import { X, BatteryCharging, BatteryWarning, Timer, ArrowDownToLine } from 'lucide-react';

function estimateEtaSec(vehicle, depotId) {
    const currentEdgeRemaining = vehicle.edgeTravelSec > 0
        ? Math.max(0, vehicle.edgeTravelSec - vehicle.edgeProgressSec)
        : 0;

    if (vehicle.nextNode === depotId) {
        return currentEdgeRemaining;
    }

    const route = Array.isArray(vehicle.route) ? vehicle.route : [];
    const nextNodes = route.includes(depotId)
        ? route.slice(0, route.indexOf(depotId) + 1)
        : route;

    const remainingHops = Math.max(0, nextNodes.length);
    return currentEdgeRemaining + remainingHops * 12;
}

function formatSec(sec) {
    const safe = Math.max(0, Math.round(sec));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function DepotView({ depotId, snapshot, onClose }) {
    if (!snapshot || !depotId) return null;

    const vehicles = snapshot.vehicles || [];
    const events = snapshot.recentEvents || [];

    const chargingPods = useMemo(
        () => vehicles
            .filter(v => v.node === depotId && v.state === 'charging')
            .sort((a, b) => a.battery - b.battery),
        [vehicles, depotId]
    );

    const parkedPods = useMemo(
        () => vehicles.filter(v => v.node === depotId && v.state === 'idle_empty'),
        [vehicles, depotId]
    );

    const inboundPods = useMemo(
        () => vehicles
            .filter(v => {
                if (v.purpose !== 'charge' || v.node === depotId) return false;
                if (v.nextNode === depotId) return true;
                if (Array.isArray(v.route) && v.route.includes(depotId)) return true;
                if (Array.isArray(v.selectedRoute) && v.selectedRoute[v.selectedRoute.length - 1] === depotId) return true;
                return false;
            })
            .map(v => ({ ...v, etaSec: estimateEtaSec(v, depotId) }))
            .sort((a, b) => a.etaSec - b.etaSec),
        [vehicles, depotId]
    );

    const depotEvents = useMemo(
        () => events
            .filter(e => e.depot === depotId)
            .slice(-12)
            .reverse(),
        [events, depotId]
    );

    const bayCount = 6;
    const baySlots = Array.from({ length: bayCount }, (_, idx) => chargingPods[idx] || null);

    return (
        <div className="absolute inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-8">
            <div className="w-full max-w-6xl h-full max-h-[820px] bg-slate-800 rounded-3xl border border-slate-600 shadow-2xl flex flex-col overflow-hidden">
                <div className="h-16 border-b border-slate-700 flex items-center justify-between px-6 bg-gradient-to-r from-slate-800 to-slate-700/70">
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold text-white">Depot Detail: {depotId}</h2>
                        <span className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-full text-xs font-bold border border-amber-500/30">CHARGING OPS</span>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-300 hover:text-white transition">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    <div className="flex-1 bg-slate-900 p-6 border-r border-slate-700 overflow-hidden">
                        <div className="h-full rounded-2xl bg-slate-950 border border-slate-800 p-5 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-slate-200 text-sm font-bold uppercase tracking-wide">Mini Floor View</h3>
                                <div className="text-xs text-slate-400">6 charging bays</div>
                            </div>

                            <svg width="100%" height="310" viewBox="0 0 900 310" className="rounded-xl border border-slate-800 bg-slate-950">
                                <rect x="30" y="90" width="840" height="120" rx="12" fill="#111827" stroke="#334155" strokeWidth="2" />
                                <text x="42" y="80" fill="#94a3b8" fontSize="12">Inbound lane to charging hall</text>

                                <path d="M 40 150 L 860 150" stroke="#1e293b" strokeWidth="10" strokeLinecap="round" />

                                {inboundPods.slice(0, 8).map((pod, idx) => (
                                    <g key={pod.id} transform={`translate(${80 + idx * 88}, 150)`}>
                                        <circle r="10" fill="#f59e0b" stroke="#f8fafc" strokeWidth="1.5" />
                                        <text y="26" fill="#f8fafc" fontSize="10" textAnchor="middle">{pod.id}</text>
                                    </g>
                                ))}

                                {baySlots.map((pod, idx) => {
                                    const bayX = 80 + idx * 130;
                                    return (
                                        <g key={`bay-${idx}`} transform={`translate(${bayX}, 230)`}>
                                            <rect x="0" y="0" width="100" height="52" rx="8" fill="#0f172a" stroke="#475569" strokeWidth="1.5" />
                                            <text x="50" y="16" fill="#94a3b8" fontSize="10" textAnchor="middle">Bay {idx + 1}</text>
                                            {pod ? (
                                                <>
                                                    <rect x="12" y="22" width="76" height="8" rx="4" fill="#1e293b" />
                                                    <rect x="12" y="22" width={`${Math.max(0, Math.min(100, pod.battery)) * 0.76}`} height="8" rx="4" fill="#f59e0b" />
                                                    <text x="50" y="44" fill="#fde68a" fontSize="9" textAnchor="middle">{pod.id} • {pod.battery.toFixed(1)}%</text>
                                                </>
                                            ) : (
                                                <text x="50" y="36" fill="#475569" fontSize="9" textAnchor="middle">Available</text>
                                            )}
                                        </g>
                                    );
                                })}
                            </svg>

                            <div className="grid grid-cols-4 gap-2 text-[11px]">
                                <InfoChip label="Charging" value={chargingPods.length} tone="amber" icon={<BatteryCharging size={14} />} />
                                <InfoChip label="Inbound" value={inboundPods.length} tone="blue" icon={<ArrowDownToLine size={14} />} />
                                <InfoChip label="Parked" value={parkedPods.length} tone="slate" icon={<Timer size={14} />} />
                                <InfoChip label="Low Batt" value={inboundPods.filter(v => v.battery < 20).length} tone="red" icon={<BatteryWarning size={14} />} />
                            </div>
                        </div>
                    </div>

                    <div className="w-96 bg-slate-800 p-5 flex flex-col border-l border-slate-700 overflow-y-auto custom-scrollbar space-y-4">
                        <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Incoming Queue Timeline</h3>
                            <div className="space-y-2 max-h-44 overflow-y-auto custom-scrollbar">
                                {inboundPods.length === 0 && <div className="text-xs text-slate-500">No pods currently inbound for charge.</div>}
                                {inboundPods.map(pod => (
                                    <div key={pod.id} className="rounded border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-xs">
                                        <div className="flex justify-between text-slate-200">
                                            <span className="font-semibold">{pod.id}</span>
                                            <span className="text-blue-300">ETA {formatSec(pod.etaSec)}</span>
                                        </div>
                                        <div className="text-slate-400">Battery {pod.battery.toFixed(1)}% • from {pod.node}</div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Charging Progress</h3>
                            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                                {chargingPods.length === 0 && <div className="text-xs text-slate-500">No active charging.</div>}
                                {chargingPods.map(pod => {
                                    const pct = Math.max(0, Math.min(100, pod.battery));
                                    return (
                                        <div key={pod.id} className="rounded border border-slate-700 bg-slate-800/60 px-2 py-2 text-xs">
                                            <div className="flex justify-between text-slate-200 mb-1">
                                                <span className="font-semibold">{pod.id}</span>
                                                <span className="text-amber-300">{pct.toFixed(1)}%</span>
                                            </div>
                                            <div className="h-1.5 bg-slate-700 rounded overflow-hidden">
                                                <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${pct}%` }} />
                                            </div>
                                            <div className="text-slate-400 mt-1">Release rule: leaves only at 100%</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Depot Event Log</h3>
                            <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar">
                                {depotEvents.length === 0 && <div className="text-xs text-slate-500">No recent depot events.</div>}
                                {depotEvents.map((event, idx) => {
                                    const minute = Math.floor((event.t || 0) / 60).toString().padStart(2, '0');
                                    const second = Math.floor((event.t || 0) % 60).toString().padStart(2, '0');
                                    return (
                                        <div key={`${event.type}-${event.vehicleId}-${event.t}-${idx}`} className="text-xs rounded bg-slate-800/70 border border-slate-700 px-2 py-1.5">
                                            <div className="text-slate-200 font-semibold">[{minute}:{second}] {event.vehicleId}</div>
                                            {event.type === 'low_battery_route_to_depot' && <div className="text-orange-300">Low battery {event.battery}% → routing in</div>}
                                            {event.type === 'charging_started' && <div className="text-amber-300">Charging started ({event.battery}%)</div>}
                                            {event.type === 'charging_complete' && <div className="text-emerald-300">Charging complete ({event.battery}%)</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}

function InfoChip({ label, value, tone, icon }) {
    const tones = {
        amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
        blue: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
        slate: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
        red: 'bg-red-500/10 text-red-300 border-red-500/30',
    };

    return (
        <div className={`rounded-lg border px-2 py-1.5 ${tones[tone] || tones.slate}`}>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide">
                {icon}
                <span>{label}</span>
            </div>
            <div className="font-bold text-sm mt-0.5">{value}</div>
        </div>
    );
}

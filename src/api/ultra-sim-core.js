/**
 * Ultra-style PRT simulation core.
 *
 * This module focuses on the behavior described in the tutorial:
 * - Stations, depots, and one-way guideway links
 * - Station-demand sliders or explicit OD matrix
 * - Empty vehicle dispatch to waiting passengers
 * - Vehicle lifecycle colors/states: red, green, blue, grey
 * - Warmup + timed simulation + summary KPIs
 */

const DEFAULTS = {
  vehicleSpeedMps: 15,          // Adjustable vehicle speed (15 m/s = 54 km/h)
  boardingTimeSec: 20,
  dockingTimeSec: 10,
  approachPlatformSec: 8,
  unloadingTimeSec: 20,
  minimumHeadwaySec: 3,         // Reserved for future merge scheduling
  stationBerths: 5,
  minReadyPodsPerStation: 0,    // Start with 0 ready pods by default
  maxPassengersPerPod: 6,
  lowBatteryThreshold: 30,      // Prioritize nearest depot below 30%
  criticalBatteryThreshold: 8,
  chargingReleaseThreshold: 100, // Only release at 100%
  warmupSec: 0,                 // Do not auto warmup
  runSec: 2 * 60 * 60,
  dispatchWeights: {
    eta: 1.2,
    battery: 0.9,
    demand: 1.1,
    congestion: 1.0,
  },
};

const SCENARIO_PRESETS = {
  peak_hour_surge: {
    label: 'Peak-hour surge',
    durationSec: 10 * 60,
    demandMultiplier: 2.2,
  },
  outage: {
    label: 'Station outage',
    durationSec: 8 * 60,
  },
  blocked_corridor: {
    label: 'Blocked corridor',
    durationSec: 6 * 60,
  },
  depot_overload: {
    label: 'Depot overload',
    durationSec: 12 * 60,
    chargingRateMultiplier: 0.45,
  },
};

function cloneDeep(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashSeed(value) {
  const text = String(value ?? 'hermes-seed');
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) || 123456789;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeEdgeKey(a, b) {
  return `${a}->${b}`;
}

export class UltraSimCore {
  constructor({ nodes, edges, stationDemand = {}, settings = {}, seed = 'hermes-default-seed' }) {
    this.nodes = cloneDeep(nodes);
    this.edges = this.normalizeEdges(cloneDeep(edges));
    this.settings = { ...DEFAULTS, ...settings };

    this.seed = seed;
    this.random = mulberry32(hashSeed(seed));

    this.stationIds = Object.keys(this.nodes).filter(id => this.nodes[id].type === 'station');
    this.depotIds = Object.keys(this.nodes).filter(id => this.nodes[id].type === 'depot');

    this.adj = this.buildAdjacency();
    this.edgeDistance = this.buildEdgeDistanceMap();

    this.stationDemand = {};
    this.stationIds.forEach(id => {
      // Station demand is now interpreted as "groups per half hour"
      // Defaulting to 0 for a blank canvas start.
      this.stationDemand[id] = Number(stationDemand[id] || 0);
    });

    this.odMatrix = this.generateGravityODMatrix();

    this.timeSec = 0;
    this.finished = false;
    this.energyConsumedUnits = 0;
    this.edgeTraffic = {};

    this.scenarios = [];
    this.blockedEdges = new Set();
    this.stationOutages = new Set();
    this.chargingRateMultiplier = 1;
    this.activeScenarioName = null;

    this.stations = this.stationIds.reduce((acc, stationId) => {
      acc[stationId] = {
        queue: [],
        berths: this.settings.stationBerths,
        waitingNow: 0,
        nextPlatform: 1,
        servedGroups: 0,
        totalWaitSec: 0,
        under60Sec: 0,
      };
      return acc;
    }, {});

    this.vehicles = [];
    this.nextPassengerId = 1;
    this.log = [];

    this.initialBlueprint = {
      nodes: cloneDeep(this.nodes),
      edges: cloneDeep(this.edges),
      stationDemand: cloneDeep(stationDemand),
      settings: cloneDeep(this.settings),
      seed,
    };

    this.initializeFleet();
  }

  rand() {
    return this.random();
  }

  normalizeEdges(rawEdges = []) {
    return rawEdges
      .map(edge => {
        if (Array.isArray(edge) && edge.length >= 2) {
          return { from: edge[0], to: edge[1], curve: 0 };
        }
        if (edge && typeof edge === 'object' && edge.from && edge.to) {
          return {
            from: edge.from,
            to: edge.to,
            curve: Number(edge.curve || 0),
            distance: edge.distance ? Number(edge.distance) : undefined,
          };
        }
        return null;
      })
      .filter(Boolean);
  }

  buildAdjacency() {
    const adj = {};
    Object.keys(this.nodes).forEach(id => {
      adj[id] = [];
    });

    this.edges.forEach(({ from: a, to: b }) => {
      if (adj[a] && this.nodes[b]) {
        adj[a].push(b);
      }
      if (adj[b] && this.nodes[a] && !adj[b].includes(a)) {
        adj[b].push(a);
      }
    });

    return adj;
  }

  buildEdgeDistanceMap() {
    const map = {};
    this.edges.forEach(({ from: a, to: b, distance }) => {
      const n1 = this.nodes[a];
      const n2 = this.nodes[b];
      if (!n1 || !n2) return;
      const physicalDist = Math.hypot(n2.x - n1.x, n2.y - n1.y);
      const dist = typeof distance === 'number' ? distance : physicalDist;
      map[makeEdgeKey(a, b)] = dist;
      map[makeEdgeKey(b, a)] = dist;
    });
    return map;
  }

  resetWithSeed(seedOverride = this.seed) {
    const blueprint = cloneDeep(this.initialBlueprint);

    this.seed = seedOverride;
    this.random = mulberry32(hashSeed(this.seed));
    this.nodes = cloneDeep(blueprint.nodes);
    this.edges = this.normalizeEdges(cloneDeep(blueprint.edges));
    this.settings = { ...DEFAULTS, ...blueprint.settings };

    this.stationIds = Object.keys(this.nodes).filter(id => this.nodes[id].type === 'station');
    this.depotIds = Object.keys(this.nodes).filter(id => this.nodes[id].type === 'depot');

    this.adj = this.buildAdjacency();
    this.edgeDistance = this.buildEdgeDistanceMap();

    this.stationDemand = {};
    this.stationIds.forEach(id => {
      this.stationDemand[id] = Number(blueprint.stationDemand[id] || 0);
    });
    this.odMatrix = this.generateGravityODMatrix();

    this.timeSec = 0;
    this.finished = false;
    this.energyConsumedUnits = 0;
    this.edgeTraffic = {};

    this.scenarios = [];
    this.blockedEdges = new Set();
    this.stationOutages = new Set();
    this.chargingRateMultiplier = 1;
    this.activeScenarioName = null;

    this.stations = this.stationIds.reduce((acc, stationId) => {
      acc[stationId] = {
        queue: [],
        berths: this.settings.stationBerths,
        waitingNow: 0,
        nextPlatform: 1,
        servedGroups: 0,
        totalWaitSec: 0,
        under60Sec: 0,
      };
      return acc;
    }, {});

    this.vehicles = [];
    this.nextPassengerId = 1;
    this.log = [];
    this.initializeFleet();

    return this.getSnapshot();
  }

  validateNetwork() {
    const errors = [];

    if (this.stationIds.length < 2) {
      errors.push('Network must contain at least two stations.');
    }

    if (this.depotIds.length < 1) {
      errors.push('Network must contain at least one depot.');
    }

    const stationReachability = this.stationIds.every(origin => {
      const reachable = this.reachableFrom(origin);
      return this.stationIds.every(dest => origin === dest || reachable.has(dest));
    });

    if (!stationReachability) {
      errors.push('Not all stations are reachable from each other via the current network links.');
    }

    return {
      ok: errors.length === 0,
      errors,
    };
  }

  reachableFrom(start) {
    const visited = new Set([start]);
    const queue = [start];

    while (queue.length > 0) {
      const current = queue.shift();
      (this.adj[current] || []).forEach(next => {
        if (this.isEdgeBlocked(current, next)) return;
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      });
    }

    return visited;
  }

  setStationDemand(stationDemand) {
    this.stationIds.forEach(id => {
      this.stationDemand[id] = Number(stationDemand[id] || this.stationDemand[id] || 1);
    });
    this.odMatrix = this.generateGravityODMatrix();
  }

  setODMatrix(matrix) {
    const normalized = {};

    this.stationIds.forEach(origin => {
      normalized[origin] = {};
      this.stationIds.forEach(dest => {
        if (origin === dest) {
          normalized[origin][dest] = 0;
          return;
        }
        const value = Math.max(0, Number(matrix?.[origin]?.[dest] || 0));
        normalized[origin][dest] = value;
      });

      const rowSum = this.stationIds.reduce((sum, dest) => sum + normalized[origin][dest], 0);
      const groupsPerHalfHourLimit = this.stationDemand[origin] || 0;
      if (rowSum > 0 && rowSum !== groupsPerHalfHourLimit) {
        const scale = groupsPerHalfHourLimit / rowSum;
        this.stationIds.forEach(dest => {
          normalized[origin][dest] = Number((normalized[origin][dest] * scale).toFixed(2));
        });
      }
    });

    this.odMatrix = normalized;
  }

  generateGravityODMatrix() {
    const matrix = {};

    this.stationIds.forEach(origin => {
      matrix[origin] = {};
      const originDemand = this.stationDemand[origin] || 1;

      let scoreSum = 0;
      const scores = {};

      this.stationIds.forEach(dest => {
        if (origin === dest) {
          scores[dest] = 0;
          return;
        }

        const destDemand = this.stationDemand[dest] || 1;
        const path = this.shortestPath(origin, dest);
        const hops = Math.max(1, path.length);
        const score = (originDemand * destDemand) / hops;

        scores[dest] = score;
        scoreSum += score;
      });

      this.stationIds.forEach(dest => {
        if (origin === dest) {
          matrix[origin][dest] = 0;
          return;
        }
        const share = scoreSum === 0 ? 0 : scores[dest] / scoreSum;
        // Total groups per half hour for this origin gives the baseline rate
        matrix[origin][dest] = Number((share * originDemand).toFixed(2));
      });
    });

    return matrix;
  }

  initializeFleet() {
    // Empty fleet per user requirements. Pods are added manually via the Depot view.
    this.vehicles = [];
  }

  createVehicle({ id, node, battery = 100 }) {
    return {
      id,
      state: this.nodes[node]?.type === 'depot' ? 'charging' : 'idle_empty',
      node,
      nextNode: null,
      route: [],
      edgeProgressSec: 0,
      edgeTravelSec: 0,
      timerSec: 0,
      passenger: null,
      battery,
      speedMps: 0,
      capacity: this.settings.maxPassengersPerPod,
      targetPlatform: null,
      purpose: null,
      direction: 'next',
      selectedRoute: [],
    };
  }

  applyScenario(name, options = {}) {
    const preset = SCENARIO_PRESETS[name];
    if (!preset) return { ok: false, message: 'Unknown scenario.' };

    const mergedOptions = { ...preset, ...options };
    const scenario = {
      name,
      startedAt: this.timeSec,
      endsAt: this.timeSec + Number(mergedOptions.durationSec || preset.durationSec),
      options: mergedOptions,
    };

    this.scenarios.push(scenario);
    this.activeScenarioName = scenario.name;

    if (name === 'outage') {
      const stationId = mergedOptions.stationId || this.stationIds[Math.floor(this.rand() * this.stationIds.length)];
      if (stationId) {
        scenario.options.stationId = stationId;
        this.stationOutages.add(stationId);
      }
      this.log.push({ t: this.timeSec, type: 'scenario_outage', stationId, untilSec: scenario.endsAt });
    }

    if (name === 'blocked_corridor') {
      const selectedEdge = mergedOptions.edge || this.edges[Math.floor(this.rand() * this.edges.length)];
      if (selectedEdge?.from && selectedEdge?.to) {
        scenario.options.edge = selectedEdge;
        this.blockedEdges.add(makeEdgeKey(selectedEdge.from, selectedEdge.to));
        this.blockedEdges.add(makeEdgeKey(selectedEdge.to, selectedEdge.from));
        this.log.push({ t: this.timeSec, type: 'scenario_blocked_corridor', from: selectedEdge.from, to: selectedEdge.to, untilSec: scenario.endsAt });
      }
    }

    if (name === 'peak_hour_surge') {
      this.log.push({ t: this.timeSec, type: 'scenario_peak_hour_surge', multiplier: mergedOptions.demandMultiplier, untilSec: scenario.endsAt });
    }

    if (name === 'depot_overload') {
      this.chargingRateMultiplier = Number(mergedOptions.chargingRateMultiplier || 0.45);
      this.log.push({ t: this.timeSec, type: 'scenario_depot_overload', rateMultiplier: this.chargingRateMultiplier, untilSec: scenario.endsAt });
    }

    return { ok: true, scenario };
  }

  injectDisruption(type, payload = {}) {
    return this.applyScenario(type, payload);
  }

  clearExpiredScenarios() {
    const active = this.scenarios.filter(s => s.endsAt > this.timeSec);
    const expired = this.scenarios.filter(s => s.endsAt <= this.timeSec);
    this.scenarios = active;

    if (expired.length > 0) {
      const activeOutages = active.filter(s => s.name === 'outage').map(s => s.options.stationId).filter(Boolean);
      this.stationOutages = new Set(activeOutages);

      const blocked = new Set();
      active.filter(s => s.name === 'blocked_corridor').forEach(s => {
        const edge = s.options.edge;
        if (edge?.from && edge?.to) {
          blocked.add(makeEdgeKey(edge.from, edge.to));
          blocked.add(makeEdgeKey(edge.to, edge.from));
        }
      });
      this.blockedEdges = blocked;

      const overload = active.find(s => s.name === 'depot_overload');
      this.chargingRateMultiplier = overload ? Number(overload.options.chargingRateMultiplier || 0.45) : 1;

      expired.forEach(s => {
        this.log.push({ t: this.timeSec, type: 'scenario_ended', scenario: s.name });
      });
    }

    this.activeScenarioName = active.length > 0 ? active[active.length - 1].name : null;
  }

  getDemandMultiplier() {
    const surge = this.scenarios.find(s => s.name === 'peak_hour_surge');
    return surge ? Number(surge.options.demandMultiplier || 1) : 1;
  }

  isEdgeBlocked(from, to) {
    if (!this.blockedEdges) return false;
    return this.blockedEdges.has(makeEdgeKey(from, to));
  }

  addVehicleAtDepot({ vehicleId, depotId, battery = 95 }) {
    const cleanId = String(vehicleId || '').trim();
    if (!cleanId) {
      return { ok: false, message: 'Pod ID is required.' };
    }
    if (!this.depotIds.includes(depotId)) {
      return { ok: false, message: 'Selected depot is invalid.' };
    }
    if (this.vehicles.some(v => v.id.toLowerCase() === cleanId.toLowerCase())) {
      return { ok: false, message: `Pod ${cleanId} already exists.` };
    }

    this.vehicles.push(this.createVehicle({
      id: cleanId,
      node: depotId,
      battery: Math.max(10, Math.min(100, Number(battery) || 95)),
    }));
    this.log.push({ t: this.timeSec, type: 'manual_add_pod', vehicleId: cleanId, depotId });
    return { ok: true, message: `Pod ${cleanId} added at ${depotId}.` };
  }

  pickPlatformForStation(stationId) {
    const station = this.stations[stationId];
    if (!station) return 1;
    const platform = station.nextPlatform;
    station.nextPlatform = station.nextPlatform >= station.berths ? 1 : station.nextPlatform + 1;
    return platform;
  }

  getDirectionLabel(fromNode, toNode) {
    const from = this.nodes[fromNode];
    const to = this.nodes[toNode];
    if (!from || !to) return 'next';
    return to.x >= from.x ? 'next' : 'previous';
  }

  sendVehicleToNearestDepot(vehicle) {
    let best = null;
    let bestPath = null;
    this.depotIds.forEach(depotId => {
      const path = this.shortestPath(vehicle.node, depotId);
      if (path.length < 2) return;
      if (!best || path.length < bestPath.length) {
        best = depotId;
        bestPath = path;
      }
    });

    if (!bestPath) return false;

    const wasPurpose = vehicle.purpose;
    vehicle.state = 'repositioning';
    vehicle.route = bestPath.slice(1);
    vehicle.purpose = 'charge';
    vehicle.passenger = null;
    vehicle.targetPlatform = null;
    vehicle.selectedRoute = bestPath;
    this.startNextEdge(vehicle);

    if (wasPurpose !== 'charge') {
      this.log.push({
        t: this.timeSec,
        type: 'low_battery_route_to_depot',
        vehicleId: vehicle.id,
        from: bestPath[0],
        depot: best,
        battery: Number(vehicle.battery.toFixed(1)),
      });
    }

    return true;
  }

  beginPickupAtStation(vehicle, stationId) {
    if (!this.stations[stationId] || this.stations[stationId].queue.length === 0) return false;
    vehicle.state = 'approaching_platform';
    vehicle.timerSec = this.settings.approachPlatformSec;
    vehicle.targetPlatform = this.pickPlatformForStation(stationId);
    vehicle.purpose = 'pickup';
    return true;
  }

  shortestPath(start, end) {
    if (start === end) return [start];

    const dist = {};
    const prev = {};
    const unvisited = new Set(Object.keys(this.nodes));

    Object.keys(this.nodes).forEach(id => {
      dist[id] = Infinity;
      prev[id] = null;
    });

    dist[start] = 0;

    while (unvisited.size > 0) {
      let current = null;
      let best = Infinity;

      unvisited.forEach(id => {
        if (dist[id] < best) {
          best = dist[id];
          current = id;
        }
      });

      if (current === null || current === end) break;
      unvisited.delete(current);

      (this.adj[current] || []).forEach(next => {
        if (this.isEdgeBlocked(current, next)) return;
        if (!unvisited.has(next)) return;
        const d = this.edgeDistance[makeEdgeKey(current, next)] || 1;
        const alt = dist[current] + d;
        if (alt < dist[next]) {
          dist[next] = alt;
          prev[next] = current;
        }
      });
    }

    if (prev[end] === null) return [];

    const path = [];
    let node = end;
    while (node) {
      path.unshift(node);
      node = prev[node];
    }

    return path;
  }

  edgeCongestionScore(path = []) {
    if (!Array.isArray(path) || path.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      total += this.edgeTraffic[makeEdgeKey(path[i], path[i + 1])] || 0;
    }
    return total / Math.max(1, path.length - 1);
  }

  scoreVehicleForStation(vehicle, stationId, path) {
    if (!path || path.length < 2) return -Infinity;

    const queueLen = this.stations[stationId]?.queue?.length || 0;
    const demandSignal = (this.stationDemand[stationId] || 1) + queueLen;

    let etaSec = 0;
    for (let i = 0; i < path.length - 1; i++) {
      etaSec += (this.edgeDistance[makeEdgeKey(path[i], path[i + 1])] || 100) / Math.max(1, this.settings.vehicleSpeedMps);
    }

    const congestion = this.edgeCongestionScore(path);
    const batteryNorm = Math.max(0, Math.min(1, Number(vehicle.battery || 0) / 100));
    const w = this.settings.dispatchWeights || DEFAULTS.dispatchWeights;

    return (w.demand * demandSignal)
      + (w.battery * batteryNorm * 10)
      - (w.eta * etaSec / 10)
      - (w.congestion * congestion * 1.5);
  }

  assignVehicleToStation(stationId) {
    let bestVehicle = null;
    let bestScore = -Infinity;

    this.vehicles.forEach(vehicle => {
      if (vehicle.state !== 'idle_empty' || vehicle.node === stationId) return;
      if (vehicle.purpose === 'charge') return;
      const path = this.shortestPath(vehicle.node, stationId);
      if (path.length < 2) return;
      const score = this.scoreVehicleForStation(vehicle, stationId, path);
      if (score > bestScore) {
        bestScore = score;
        bestVehicle = { vehicle, path };
      }
    });

    if (!bestVehicle) return null;

    const { vehicle, path } = bestVehicle;
    vehicle.state = 'repositioning';
    vehicle.route = path.slice(1);
    vehicle.selectedRoute = path;
    vehicle.purpose = 'pickup';
    vehicle.direction = this.getDirectionLabel(path[0], path[1]);
    this.startNextEdge(vehicle);

    this.log.push({ t: this.timeSec, type: 'dispatch_empty', vehicleId: vehicle.id, stationId });
    return vehicle.id;
  }

  countVehiclesHeadingToStation(stationId) {
    return this.vehicles.filter(v => {
      if (v.state !== 'repositioning') return false;
      if (v.purpose !== 'pickup' && v.purpose !== 'staging') return false;
      // Check if the vehicle's selected route ends at stationId
      return v.selectedRoute && v.selectedRoute[v.selectedRoute.length - 1] === stationId;
    }).length;
  }

  findNearestWaitingStationForVehicle(vehicle) {
    let bestStationId = null;
    let bestPath = null;
    let bestScore = -Infinity;

    this.stationIds.forEach(stationId => {
      const station = this.stations[stationId];
      if (!station || station.queue.length === 0) return;
      if (this.stationOutages.has(stationId)) return;

      // Count vehicles already heading to this station
      const vehiclesHeading = this.countVehiclesHeadingToStation(stationId);
      
      // Only send a new vehicle if fewer vehicles are heading there than are waiting
      if (vehiclesHeading >= station.queue.length) {
        return;
      }

      if (vehicle.node === stationId) {
        bestStationId = stationId;
        bestPath = [stationId];
        bestScore = Infinity;
        return;
      }

      const path = this.shortestPath(vehicle.node, stationId);
      if (path.length < 2) return;
      const score = this.scoreVehicleForStation(vehicle, stationId, path);
      if (score > bestScore) {
        bestScore = score;
        bestStationId = stationId;
        bestPath = path;
      }
    });

    if (!bestStationId) return null;
    return {
      stationId: bestStationId,
      path: bestPath,
      distance: bestScore,
    };
  }

  dispatchVehicleToPickupStation(vehicle, stationId, path = null) {
    return this.dispatchVehicleToStation(vehicle, stationId, path, 'pickup', 'dispatch_nearest_waiting_group');
  }

  dispatchVehicleToStation(vehicle, stationId, path = null, purpose = 'pickup', eventType = 'dispatch_vehicle') {
    const effectivePath = path || this.shortestPath(vehicle.node, stationId);
    if (!effectivePath || effectivePath.length < 2) return false;

    vehicle.state = 'repositioning';
    vehicle.route = effectivePath.slice(1);
    vehicle.selectedRoute = effectivePath;
    vehicle.purpose = purpose;
    vehicle.direction = this.getDirectionLabel(effectivePath[0], effectivePath[1]);
    this.startNextEdge(vehicle);

    this.log.push({
      t: this.timeSec,
      type: eventType,
      vehicleId: vehicle.id,
      stationId,
      from: effectivePath[0],
      route: effectivePath,
      purpose,
    });
    return true;
  }

  maintainStationReadiness() {
    this.stationIds.forEach((stationId) => {
      if (this.stationOutages.has(stationId)) return;

      const readyAtStation = this.vehicles.filter(v => v.node === stationId && v.state === 'idle_empty' && v.purpose !== 'charge').length;
      const shortage = Math.max(0, this.settings.minReadyPodsPerStation - readyAtStation);
      if (shortage === 0) return;

      for (let i = 0; i < shortage; i++) {
        let bestVehicle = null;
        let bestScore = -Infinity;

        this.vehicles.forEach((candidate) => {
          if (candidate.state !== 'idle_empty') return;
          if (candidate.purpose === 'charge') return;
          if (candidate.node === stationId) return;
          if ((candidate.battery || 0) < this.settings.lowBatteryThreshold) return;

          const path = this.shortestPath(candidate.node, stationId);
          if (path.length < 2) return;

          const score = this.scoreVehicleForStation(candidate, stationId, path);
          if (score > bestScore) {
            bestScore = score;
            bestVehicle = { candidate, path };
          }
        });

        if (!bestVehicle) return;
        this.dispatchVehicleToStation(
          bestVehicle.candidate,
          stationId,
          bestVehicle.path,
          'staging',
          'dispatch_station_ready_pool'
        );
      }
    });
  }

  startNextEdge(vehicle) {
    if (!vehicle.route.length) {
      vehicle.nextNode = null;
      vehicle.edgeProgressSec = 0;
      vehicle.edgeTravelSec = 0;
      return;
    }

    vehicle.nextNode = vehicle.route.shift();
    const edgeMeters = this.edgeDistance[makeEdgeKey(vehicle.node, vehicle.nextNode)] || 100;
    vehicle.edgeTravelSec = Math.max(1, edgeMeters / this.settings.vehicleSpeedMps);
    vehicle.edgeProgressSec = 0;
  }

  generatePassengerArrivals(dtSec) {
    const demandMultiplier = this.getDemandMultiplier();
    this.stationIds.forEach(origin => {
      this.stationIds.forEach(dest => {
        if (origin === dest) return;
        if (this.stationOutages.has(origin) || this.stationOutages.has(dest)) return;

        // odMatrix has shares indicating total "groups per half hour" directed to this dest
        const groupsPerHalfHour = this.odMatrix[origin][dest] || 0;
        
        // 3600 seconds = 1 hour. Half hour = 1800 seconds.
        const expected = (groupsPerHalfHour / 1800) * dtSec * demandMultiplier;

        if (this.rand() < expected) {
          const station = this.stations[origin];
          station.queue.push({
            id: `G${this.nextPassengerId++}`,
            origin,
            dest,
            arrivalSec: this.timeSec,
            groupSize: 1 + Math.floor(this.rand() * this.settings.maxPassengersPerPod),
          });
        }
      });
    });
  }

  processStations() {
    this.stationIds.forEach(stationId => {
      if (this.stationOutages.has(stationId)) return;

      const station = this.stations[stationId];
      station.waitingNow = station.queue.length;

      if (station.queue.length === 0) return;

      const localIdle = this.vehicles.find(v => v.node === stationId && v.state === 'idle_empty');
      if (!localIdle) return;
      this.beginPickupAtStation(localIdle, stationId);
    });

    this.maintainStationReadiness();
  }

  updateVehicles(dtSec) {
    this.edgeTraffic = {};

    this.vehicles.forEach(vehicle => {
      const isMoving = vehicle.state === 'moving_loaded' || vehicle.state === 'repositioning';
      const onDepot = this.nodes[vehicle.node]?.type === 'depot';

      if ((vehicle.state === 'repositioning' || vehicle.state === 'idle_empty') && onDepot && vehicle.purpose === 'charge') {
        vehicle.state = 'charging';
        this.log.push({
          t: this.timeSec,
          type: 'charging_started',
          vehicleId: vehicle.id,
          depot: vehicle.node,
          battery: Number(vehicle.battery.toFixed(1)),
        });
      }

      const shouldChargeOnDepot = onDepot
        && !isMoving
        && (vehicle.state === 'charging' || vehicle.purpose === 'charge' || vehicle.battery < this.settings.chargingReleaseThreshold);

      if (shouldChargeOnDepot) {
        vehicle.state = 'charging';
        vehicle.nextNode = null;
        vehicle.route = [];
        vehicle.edgeProgressSec = 0;
        vehicle.edgeTravelSec = 0;
        vehicle.battery = Math.min(100, vehicle.battery + (1.2 * this.chargingRateMultiplier * dtSec));
      } else {
        const batteryDrain = isMoving ? 0.06 * dtSec : (onDepot ? 0 : 0.015 * dtSec);
        vehicle.battery -= batteryDrain;
        this.energyConsumedUnits += batteryDrain;

        if (vehicle.battery < 0) vehicle.battery = 0;
        if (vehicle.purpose === 'charge' && isMoving && vehicle.battery < 1) {
          vehicle.battery = 1;
        }
      }

      const targetSpeed = isMoving ? this.settings.vehicleSpeedMps : 0;
      if (vehicle.speedMps < targetSpeed) vehicle.speedMps = Math.min(targetSpeed, vehicle.speedMps + 1.5 * dtSec);
      if (vehicle.speedMps > targetSpeed) vehicle.speedMps = Math.max(targetSpeed, vehicle.speedMps - 2.5 * dtSec);

      if (vehicle.state === 'charging') {
        if (vehicle.battery >= this.settings.chargingReleaseThreshold) {
          vehicle.state = 'idle_empty';
          vehicle.purpose = null;
          this.log.push({
            t: this.timeSec,
            type: 'charging_complete',
            vehicleId: vehicle.id,
            depot: vehicle.node,
            battery: Number(vehicle.battery.toFixed(1)),
          });
        }
        return;
      }

      if (!onDepot && vehicle.purpose !== 'charge' && vehicle.battery < this.settings.lowBatteryThreshold && vehicle.state !== 'moving_loaded') {
        const routed = this.sendVehicleToNearestDepot(vehicle);
        if (routed) return;
      }

      if (vehicle.state === 'approaching_platform' || vehicle.state === 'docking' || vehicle.state === 'boarding' || vehicle.state === 'unloading' || vehicle.state === 'waiting_slot') {
        vehicle.timerSec -= dtSec;
        if (vehicle.timerSec > 0) return;

        if (vehicle.state === 'approaching_platform') {
          vehicle.state = 'docking';
          vehicle.timerSec = this.settings.dockingTimeSec;
          this.log.push({
            t: this.timeSec,
            type: 'arrived_platform',
            vehicleId: vehicle.id,
            stationId: vehicle.node,
            platform: vehicle.targetPlatform,
          });
          return;
        }

        if (vehicle.state === 'docking') {
          if (vehicle.purpose === 'dropoff') {
            vehicle.state = 'unloading';
            vehicle.timerSec = this.settings.unloadingTimeSec;
            return;
          }

          if (vehicle.battery < this.settings.lowBatteryThreshold) {
            vehicle.state = 'idle_empty';
            vehicle.passenger = null;
            vehicle.targetPlatform = null;
            this.sendVehicleToNearestDepot(vehicle);
            return;
          }

          const station = this.stations[vehicle.node];
          if (!station || station.queue.length === 0) {
            vehicle.state = 'idle_empty';
            vehicle.purpose = null;
            vehicle.targetPlatform = null;
            return;
          }

          const pax = station.queue.shift();
          const wait = Math.max(0, this.timeSec - pax.arrivalSec);
          station.totalWaitSec += wait;
          station.servedGroups += 1;
          if (wait < 60) station.under60Sec += 1;

          vehicle.passenger = pax;
          vehicle.state = 'boarding';
          vehicle.timerSec = this.settings.boardingTimeSec;
          this.log.push({
            t: this.timeSec,
            type: 'boarding_started',
            vehicleId: vehicle.id,
            stationId: vehicle.node,
            platform: vehicle.targetPlatform,
            groupSize: pax.groupSize,
            destination: pax.dest,
          });
          return;
        }

        if (vehicle.state === 'boarding') {
          const path = this.shortestPath(vehicle.node, vehicle.passenger?.dest);
          if (path.length < 2) {
            vehicle.state = 'waiting_slot';
            vehicle.timerSec = this.settings.minimumHeadwaySec;
            return;
          }

          vehicle.state = 'moving_loaded';
          vehicle.route = path.slice(1);
          vehicle.selectedRoute = path;
          vehicle.direction = this.getDirectionLabel(path[0], path[1]);
          this.log.push({
            t: this.timeSec,
            type: 'path_selected',
            vehicleId: vehicle.id,
            from: path[0],
            to: vehicle.passenger?.dest,
            route: path,
            platform: vehicle.targetPlatform,
          });
          this.startNextEdge(vehicle);
          return;
        }

        if (vehicle.state === 'unloading' || vehicle.state === 'waiting_slot') {
          const previousPurpose = vehicle.purpose;
          const station = vehicle.node;
          vehicle.state = 'idle_empty';
          vehicle.passenger = null;
          vehicle.purpose = null;
          vehicle.targetPlatform = null;

          this.log.push({
            t: this.timeSec,
            type: 'depart_station',
            vehicleId: vehicle.id,
            stationId: station,
            fromPurpose: previousPurpose,
          });

          if (vehicle.battery < this.settings.lowBatteryThreshold) {
            this.sendVehicleToNearestDepot(vehicle);
          }
          return;
        }
      }

      if (vehicle.state === 'idle_empty' && this.nodes[vehicle.node]?.type === 'station' && this.stations[vehicle.node]?.queue.length > 0) {
        if (vehicle.battery < this.settings.lowBatteryThreshold) {
          this.sendVehicleToNearestDepot(vehicle);
          return;
        }
        this.beginPickupAtStation(vehicle, vehicle.node);
        return;
      }

      if (vehicle.state === 'idle_empty' && vehicle.purpose !== 'charge') {
        const nearestWaiting = this.findNearestWaitingStationForVehicle(vehicle);
        if (nearestWaiting) {
          if (nearestWaiting.stationId === vehicle.node) {
            this.beginPickupAtStation(vehicle, nearestWaiting.stationId);
          } else {
            this.dispatchVehicleToPickupStation(vehicle, nearestWaiting.stationId, nearestWaiting.path);
          }
          return;
        }
      }

      if (vehicle.state === 'idle_empty' && vehicle.battery < this.settings.lowBatteryThreshold) {
        this.sendVehicleToNearestDepot(vehicle);
        return;
      }

      if (vehicle.state === 'moving_loaded' || vehicle.state === 'repositioning') {
        if (!vehicle.nextNode) {
          this.startNextEdge(vehicle);
          if (!vehicle.nextNode) {
            if (vehicle.purpose === 'charge' && this.nodes[vehicle.node]?.type === 'depot') {
              vehicle.state = 'charging';
            } else {
              vehicle.state = 'idle_empty';
            }
            return;
          }
        }

        vehicle.edgeProgressSec += dtSec;
        if (vehicle.nextNode) {
          const key = makeEdgeKey(vehicle.node, vehicle.nextNode);
          this.edgeTraffic[key] = (this.edgeTraffic[key] || 0) + 1;
        }

        if (vehicle.edgeProgressSec >= vehicle.edgeTravelSec) {
          vehicle.node = vehicle.nextNode;
          vehicle.nextNode = null;
          vehicle.edgeProgressSec = 0;
          vehicle.edgeTravelSec = 0;

          if (vehicle.route.length === 0) {
            if (vehicle.state === 'moving_loaded') {
              vehicle.state = 'approaching_platform';
              vehicle.timerSec = this.settings.approachPlatformSec;
              vehicle.purpose = 'dropoff';
              vehicle.targetPlatform = this.pickPlatformForStation(vehicle.node);
            } else if (vehicle.purpose === 'charge' && this.nodes[vehicle.node]?.type === 'depot') {
              vehicle.state = 'charging';
            } else {
              vehicle.state = 'idle_empty';
              vehicle.purpose = null;
              vehicle.targetPlatform = null;
            }
          }
        }
      }
    });
  }

  step(dtSec = 1) {
    if (this.finished) return this.getSnapshot();

    this.clearExpiredScenarios();
    this.timeSec += dtSec;
    this.generatePassengerArrivals(dtSec);
    this.processStations();
    this.updateVehicles(dtSec);

    if (this.timeSec >= this.settings.warmupSec + this.settings.runSec) {
      this.finished = true;
    }

    return this.getSnapshot();
  }

  runWarmup() {
    const steps = Math.ceil(this.settings.warmupSec);
    for (let i = 0; i < steps; i++) {
      this.step(1);
      if (this.finished) break;
    }
  }

  runToEnd() {
    while (!this.finished) {
      this.step(1);
    }
    return this.getResults();
  }

  getRunReport() {
    const results = this.getResults();
    const activeVehicles = this.vehicles.filter(v => ['moving_loaded', 'repositioning', 'boarding', 'approaching_platform', 'docking', 'unloading'].includes(v.state)).length;
    const utilizationPct = this.vehicles.length > 0 ? (100 * activeVehicles) / this.vehicles.length : 0;
    const congestionIndex = Object.values(this.edgeTraffic).length > 0
      ? Object.values(this.edgeTraffic).reduce((a, b) => a + b, 0) / Object.values(this.edgeTraffic).length
      : 0;

    return {
      seed: this.seed,
      elapsedSec: results.elapsedSec,
      servedGroups: results.totalServedGroups,
      meanWaitSec: results.overallMeanWaitSec,
      utilizationPct: Number(utilizationPct.toFixed(2)),
      energyUnits: Number(this.energyConsumedUnits.toFixed(2)),
      reliabilityPct: Number(results.overallUnder60Pct.toFixed(2)),
      congestionIndex: Number(congestionIndex.toFixed(2)),
      activeDisruptions: this.scenarios.map(s => s.name),
    };
  }

  getSnapshot() {
    const vehicleCounts = this.vehicles.reduce((acc, v) => {
      const key = this.stateToColor(v.state);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return {
      timeSec: this.timeSec,
      finished: this.finished,
      seed: this.seed,
      scenarioName: this.activeScenarioName,
      activeDisruptions: this.scenarios.map(s => ({ name: s.name, endsAt: s.endsAt, options: s.options })),
      waitingByStation: Object.fromEntries(this.stationIds.map(id => [id, this.stations[id].queue.length])),
      depotIds: this.depotIds,
      stationPlatforms: Object.fromEntries(this.stationIds.map(id => [id, this.stations[id].berths])),
      vehicleCounts,
      vehicles: this.vehicles,
      edgeTraffic: this.edgeTraffic,
      energyConsumedUnits: Number(this.energyConsumedUnits.toFixed(2)),
      report: this.getRunReport(),
      recentEvents: this.log.slice(-400),
    };
  }

  stateToColor(state) {
    if (state === 'boarding' || state === 'moving_loaded' || state === 'approaching_platform' || state === 'docking') return 'green';
    if (state === 'unloading') return 'blue';
    if (state === 'waiting_slot') return 'grey';
    if (state === 'charging') return 'yellow';
    return 'red';
  }

  getResults() {
    const stationSummary = this.stationIds.map(stationId => {
      const s = this.stations[stationId];
      const meanWait = s.servedGroups > 0 ? s.totalWaitSec / s.servedGroups : 0;
      const under60Pct = s.servedGroups > 0 ? (100 * s.under60Sec) / s.servedGroups : 0;
      return {
        stationId,
        servedGroups: s.servedGroups,
        waitingNow: s.queue.length,
        meanWaitSec: Number(meanWait.toFixed(2)),
        under60Pct: Number(under60Pct.toFixed(2)),
      };
    });

    const totalServed = stationSummary.reduce((sum, s) => sum + s.servedGroups, 0);
    const totalWait = this.stationIds.reduce((sum, id) => sum + this.stations[id].totalWaitSec, 0);
    const totalUnder60 = this.stationIds.reduce((sum, id) => sum + this.stations[id].under60Sec, 0);

    return {
      elapsedSec: this.timeSec,
      totalServedGroups: totalServed,
      overallMeanWaitSec: totalServed > 0 ? Number((totalWait / totalServed).toFixed(2)) : 0,
      overallUnder60Pct: totalServed > 0 ? Number(((100 * totalUnder60) / totalServed).toFixed(2)) : 0,
      vehiclesUsed: this.vehicles.length,
      energyConsumedUnits: Number(this.energyConsumedUnits.toFixed(2)),
      stationSummary,
      validation: this.validateNetwork(),
    };
  }
}

export default UltraSimCore;

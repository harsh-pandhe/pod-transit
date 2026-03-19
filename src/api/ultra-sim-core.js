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
  vehicleSpeedMps: 10,          // Simplified constant line speed
  boardingTimeSec: 30,
  unloadingTimeSec: 30,
  minimumHeadwaySec: 3,         // Reserved for future merge scheduling
  stationBerths: 5,
  maxTripsPerStationPerHour: 300,
  warmupSec: 30 * 60,
  runSec: 2 * 60 * 60,
};

function cloneDeep(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeEdgeKey(a, b) {
  return `${a}->${b}`;
}

export class UltraSimCore {
  constructor({ nodes, edges, stationDemand = {}, settings = {} }) {
    this.nodes = cloneDeep(nodes);
    this.edges = cloneDeep(edges);
    this.settings = { ...DEFAULTS, ...settings };

    this.stationIds = Object.keys(this.nodes).filter(id => this.nodes[id].type === 'station');
    this.depotIds = Object.keys(this.nodes).filter(id => this.nodes[id].type === 'depot');

    this.adj = this.buildAdjacency();
    this.edgeDistance = this.buildEdgeDistanceMap();

    this.stationDemand = {};
    this.stationIds.forEach(id => {
      this.stationDemand[id] = Number(stationDemand[id] || 1);
    });

    this.odMatrix = this.generateGravityODMatrix();

    this.timeSec = 0;
    this.finished = false;

    this.stations = this.stationIds.reduce((acc, stationId) => {
      acc[stationId] = {
        queue: [],
        berths: this.settings.stationBerths,
        waitingNow: 0,
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
  }

  buildAdjacency() {
    const adj = {};
    Object.keys(this.nodes).forEach(id => {
      adj[id] = [];
    });

    // Edges are treated as directed, matching one-way guideway behavior.
    this.edges.forEach(([a, b]) => {
      if (adj[a] && this.nodes[b]) {
        adj[a].push(b);
      }
    });

    return adj;
  }

  buildEdgeDistanceMap() {
    const map = {};
    this.edges.forEach(([a, b]) => {
      const n1 = this.nodes[a];
      const n2 = this.nodes[b];
      if (!n1 || !n2) return;
      map[makeEdgeKey(a, b)] = Math.hypot(n2.x - n1.x, n2.y - n1.y);
    });
    return map;
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
      errors.push('Not all stations are reachable from each other via directed guideway.');
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
      if (rowSum > this.settings.maxTripsPerStationPerHour) {
        const scale = this.settings.maxTripsPerStationPerHour / rowSum;
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
        matrix[origin][dest] = Number((share * this.settings.maxTripsPerStationPerHour).toFixed(2));
      });
    });

    return matrix;
  }

  initializeFleet() {
    const seedNodes = [...this.depotIds, ...this.stationIds];
    const vehicleCount = Math.max(8, this.stationIds.length * 2);

    for (let i = 0; i < vehicleCount; i++) {
      const home = seedNodes[i % seedNodes.length];
      this.vehicles.push({
        id: `V${String(i + 1).padStart(3, '0')}`,
        state: 'idle_empty', // idle_empty(red), boarding(green), moving_loaded(green), unloading(blue), waiting_slot(grey), repositioning(red)
        node: home,
        nextNode: null,
        route: [],
        edgeProgressSec: 0,
        edgeTravelSec: 0,
        timerSec: 0,
        passenger: null,
        battery: 100 - (Math.random() * 20), // 80-100% capacity
        speedMps: 0,
      });
    }
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

  assignVehicleToStation(stationId) {
    // Pick nearest red vehicle at another node and send it empty to this station.
    let bestVehicle = null;
    let bestCost = Infinity;

    this.vehicles.forEach(vehicle => {
      if (vehicle.state !== 'idle_empty' || vehicle.node === stationId) return;
      const path = this.shortestPath(vehicle.node, stationId);
      if (path.length < 2) return;
      const hopCost = path.length;
      if (hopCost < bestCost) {
        bestCost = hopCost;
        bestVehicle = { vehicle, path };
      }
    });

    if (!bestVehicle) return null;

    const { vehicle, path } = bestVehicle;
    vehicle.state = 'repositioning';
    vehicle.route = path.slice(1);
    this.startNextEdge(vehicle);

    this.log.push({ t: this.timeSec, type: 'dispatch_empty', vehicleId: vehicle.id, stationId });
    return vehicle.id;
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
    this.stationIds.forEach(origin => {
      this.stationIds.forEach(dest => {
        if (origin === dest) return;
        const tripsPerHour = this.odMatrix[origin][dest] || 0;
        const expected = (tripsPerHour / 3600) * dtSec;

        // Bernoulli approximation for short timesteps.
        if (Math.random() < expected) {
          const station = this.stations[origin];
          station.queue.push({
            id: `G${this.nextPassengerId++}`,
            origin,
            dest,
            arrivalSec: this.timeSec,
            groupSize: 1 + Math.floor(Math.random() * 4),
          });
        }
      });
    });
  }

  processStations() {
    this.stationIds.forEach(stationId => {
      const station = this.stations[stationId];
      station.waitingNow = station.queue.length;

      if (station.queue.length === 0) return;

      const localIdle = this.vehicles.find(v => v.node === stationId && v.state === 'idle_empty');
      if (!localIdle) {
        this.assignVehicleToStation(stationId);
        return;
      }

      const pax = station.queue.shift();
      localIdle.state = 'boarding';
      localIdle.timerSec = this.settings.boardingTimeSec;
      localIdle.passenger = pax;

      const wait = Math.max(0, this.timeSec - pax.arrivalSec);
      station.totalWaitSec += wait;
      station.servedGroups += 1;
      if (wait < 60) station.under60Sec += 1;
    });
  }

  updateVehicles(dtSec) {
    this.vehicles.forEach(vehicle => {
      // Basic Physics Update
      const isMoving = vehicle.state === 'moving_loaded' || vehicle.state === 'repositioning';
      const isCharging = vehicle.state === 'idle_empty' && this.nodes[vehicle.node]?.type === 'depot';
      
      if (isCharging) {
         vehicle.battery = Math.min(100, vehicle.battery + 0.5 * dtSec);
      } else {
         vehicle.battery -= (isMoving ? 0.05 * dtSec : 0.01 * dtSec);
         if (vehicle.battery < 0) vehicle.battery = 0;
      }
      
      const targetSpeed = isMoving ? this.settings.vehicleSpeedMps : 0;
      if (vehicle.speedMps < targetSpeed) vehicle.speedMps = Math.min(targetSpeed, vehicle.speedMps + 1.5 * dtSec);
      if (vehicle.speedMps > targetSpeed) vehicle.speedMps = Math.max(targetSpeed, vehicle.speedMps - 2.5 * dtSec);

      if (vehicle.state === 'boarding') {
        vehicle.timerSec -= dtSec;
        if (vehicle.timerSec <= 0) {
          const path = this.shortestPath(vehicle.node, vehicle.passenger.dest);
          if (path.length < 2) {
            vehicle.state = 'waiting_slot';
            vehicle.timerSec = this.settings.minimumHeadwaySec;
            return;
          }

          vehicle.state = 'moving_loaded';
          vehicle.route = path.slice(1);
          this.startNextEdge(vehicle);
        }
        return;
      }

      if (vehicle.state === 'unloading' || vehicle.state === 'waiting_slot') {
        vehicle.timerSec -= dtSec;
        if (vehicle.timerSec <= 0) {
          vehicle.state = 'idle_empty';
          vehicle.passenger = null;
        }
        return;
      }

      if (vehicle.state === 'moving_loaded' || vehicle.state === 'repositioning') {
        if (!vehicle.nextNode) {
          this.startNextEdge(vehicle);
          if (!vehicle.nextNode) {
            vehicle.state = 'idle_empty';
            vehicle.passenger = null;
            return;
          }
        }

        vehicle.edgeProgressSec += dtSec;
        if (vehicle.edgeProgressSec >= vehicle.edgeTravelSec) {
          vehicle.node = vehicle.nextNode;
          vehicle.nextNode = null;
          vehicle.edgeProgressSec = 0;
          vehicle.edgeTravelSec = 0;

          if (vehicle.route.length === 0) {
            if (vehicle.state === 'moving_loaded') {
              vehicle.state = 'unloading';
              vehicle.timerSec = this.settings.unloadingTimeSec;
            } else {
              vehicle.state = 'idle_empty';
            }
          }
        }
      }
    });
  }

  step(dtSec = 1) {
    if (this.finished) return this.getSnapshot();

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

  getSnapshot() {
    const vehicleCounts = this.vehicles.reduce((acc, v) => {
      const key = this.stateToColor(v.state);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return {
      timeSec: this.timeSec,
      finished: this.finished,
      waitingByStation: Object.fromEntries(this.stationIds.map(id => [id, this.stations[id].queue.length])),
      vehicleCounts,
      vehicles: this.vehicles,
    };
  }

  stateToColor(state) {
    if (state === 'boarding' || state === 'moving_loaded') return 'green';
    if (state === 'unloading') return 'blue';
    if (state === 'waiting_slot') return 'grey';
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
      stationSummary,
      validation: this.validateNetwork(),
    };
  }
}

export default UltraSimCore;

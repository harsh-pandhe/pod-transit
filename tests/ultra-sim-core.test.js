import test from 'node:test';
import assert from 'node:assert/strict';
import { UltraSimCore } from '../src/api/ultra-sim-core.js';

function createCore() {
  const nodes = {
    'Station A': { name: 'Station A', type: 'station', x: 0, y: 0 },
    'Station B': { name: 'Station B', type: 'station', x: 100, y: 0 },
    'Depot 1': { name: 'Depot 1', type: 'depot', x: 50, y: 60 },
  };

  const edges = [
    { from: 'Station A', to: 'Station B', curve: 0 },
    { from: 'Station B', to: 'Depot 1', curve: 0 },
    { from: 'Station A', to: 'Depot 1', curve: 0 },
  ];

  return new UltraSimCore({
    nodes,
    edges,
    stationDemand: { 'Station A': 0, 'Station B': 0 },
    settings: {
      warmupSec: 1,
      runSec: 30,
      chargingReleaseThreshold: 100,
      lowBatteryThreshold: 30,
    },
  });
}

test('network validation passes for connected network', () => {
  const core = createCore();
  const validation = core.validateNetwork();
  assert.equal(validation.ok, true);
  assert.equal(validation.errors.length, 0);
});

test('addVehicleAtDepot enforces unique IDs', () => {
  const core = createCore();
  core.vehicles = [];

  const added = core.addVehicleAtDepot({ vehicleId: 'POD-900', depotId: 'Depot 1', battery: 85 });
  const duplicate = core.addVehicleAtDepot({ vehicleId: 'pod-900', depotId: 'Depot 1', battery: 90 });

  assert.equal(added.ok, true);
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.message, /already exists/i);
});

test('idle vehicle dispatches to nearest waiting station', () => {
  const core = createCore();
  core.vehicles = [
    core.createVehicle({ id: 'V001', node: 'Station A', battery: 90 }),
  ];

  core.stations['Station B'].queue.push({
    id: 'G1',
    origin: 'Station B',
    dest: 'Station A',
    arrivalSec: 0,
    groupSize: 2,
  });

  core.updateVehicles(1);

  const vehicle = core.vehicles[0];
  assert.equal(vehicle.state, 'repositioning');
  assert.equal(vehicle.purpose, 'pickup');
  assert.ok(vehicle.selectedRoute.length >= 2);
  assert.ok(core.log.some((event) => event.type === 'dispatch_nearest_waiting_group'));
});

test('vehicle below 30% battery routes to depot for charging', () => {
  const core = createCore();
  core.vehicles = [
    core.createVehicle({ id: 'V002', node: 'Station A', battery: 25 }),
  ];

  core.updateVehicles(1);

  const vehicle = core.vehicles[0];
  assert.equal(vehicle.purpose, 'charge');
  assert.equal(vehicle.state, 'repositioning');
  assert.ok(vehicle.selectedRoute.includes('Depot 1'));
  assert.ok(core.log.some((event) => event.type === 'low_battery_route_to_depot'));
});

test('station ready pool dispatch keeps pods staged', () => {
  const core = new UltraSimCore({
    nodes: {
      'Station A': { name: 'Station A', type: 'station', x: 0, y: 0 },
      'Station B': { name: 'Station B', type: 'station', x: 80, y: 0 },
      'Depot 1': { name: 'Depot 1', type: 'depot', x: 40, y: 50 },
    },
    edges: [
      { from: 'Station A', to: 'Station B', curve: 0 },
      { from: 'Station B', to: 'Station A', curve: 0 },
      { from: 'Depot 1', to: 'Station A', curve: 0 },
      { from: 'Station A', to: 'Depot 1', curve: 0 },
      { from: 'Depot 1', to: 'Station B', curve: 0 },
      { from: 'Station B', to: 'Depot 1', curve: 0 },
    ],
    stationDemand: { 'Station A': 0, 'Station B': 0 },
    settings: {
      lowBatteryThreshold: 30,
      minReadyPodsPerStation: 2,
      warmupSec: 1,
      runSec: 30,
    },
  });

  core.vehicles = [
    core.createVehicle({ id: 'V010', node: 'Depot 1', battery: 90 }),
    core.createVehicle({ id: 'V011', node: 'Station A', battery: 92 }),
    core.createVehicle({ id: 'V012', node: 'Station B', battery: 88 }),
  ];

  core.processStations();

  assert.ok(core.log.some((event) => event.type === 'dispatch_station_ready_pool'));
  assert.ok(core.vehicles.some((v) => v.purpose === 'staging' && v.state === 'repositioning'));
});

test('charging vehicle releases only after reaching threshold', () => {
  const core = createCore();
  core.vehicles = [
    {
      ...core.createVehicle({ id: 'V003', node: 'Depot 1', battery: 99.5 }),
      state: 'charging',
      purpose: 'charge',
    },
  ];

  core.updateVehicles(1);

  const vehicle = core.vehicles[0];
  assert.equal(vehicle.state, 'idle_empty');
  assert.equal(vehicle.purpose, null);
  assert.ok(vehicle.battery >= 100);
  assert.ok(core.log.some((event) => event.type === 'charging_complete'));
});

test('depot pod can depart and serve groups after dispatch', () => {
  const nodes = {
    'Station A': { name: 'Station A', type: 'station', x: 0, y: 0 },
    'Station B': { name: 'Station B', type: 'station', x: 300, y: 0 },
    'Depot 1': { name: 'Depot 1', type: 'depot', x: 300, y: -180 },
  };
  const edges = [
    { from: 'Station A', to: 'Station B', curve: 0 },
    { from: 'Station B', to: 'Station A', curve: 0 },
    { from: 'Depot 1', to: 'Station B', curve: 0 },
    { from: 'Station B', to: 'Depot 1', curve: 0 },
  ];

  const core = new UltraSimCore({
    nodes,
    edges,
    seed: 'DEPOT-DISPATCH-TEST',
    stationDemand: { 'Station A': 0, 'Station B': 20 },
    settings: {
      vehicleSpeedMps: 15,
      warmupSec: 0,
      runSec: 1200,
      chargingReleaseThreshold: 100,
      lowBatteryThreshold: 30,
    },
  });

  const added = core.addVehicleAtDepot({ vehicleId: 'POD-1', depotId: 'Depot 1', battery: 100 });
  assert.equal(added.ok, true);

  for (let i = 0; i < 6000; i++) {
    core.step(0.15);
  }

  const results = core.getResults();
  assert.ok(results.totalServedGroups > 0);
  assert.ok(core.log.some((event) => event.type === 'boarding_started'));
  assert.ok(core.log.some((event) => event.type === 'depart_station'));
});

test('deterministic seed produces reproducible first steps', () => {
  const nodes = {
    'Station A': { name: 'Station A', type: 'station', x: 0, y: 0 },
    'Station B': { name: 'Station B', type: 'station', x: 80, y: 0 },
    'Depot 1': { name: 'Depot 1', type: 'depot', x: 40, y: 60 },
  };
  const edges = [
    { from: 'Station A', to: 'Station B', curve: 0 },
    { from: 'Station B', to: 'Depot 1', curve: 0 },
    { from: 'Station A', to: 'Depot 1', curve: 0 },
  ];

  const one = new UltraSimCore({ nodes, edges, seed: 'SEED-42' });
  const two = new UltraSimCore({ nodes, edges, seed: 'SEED-42' });

  one.step(1);
  two.step(1);

  const oneBatteries = one.vehicles.slice(0, 4).map(v => Number(v.battery.toFixed(4)));
  const twoBatteries = two.vehicles.slice(0, 4).map(v => Number(v.battery.toFixed(4)));

  assert.deepEqual(oneBatteries, twoBatteries);
});

test('scenario application registers active disruptions', () => {
  const core = createCore();
  const result = core.applyScenario('blocked_corridor');
  assert.equal(result.ok, true);

  const snapshot = core.getSnapshot();
  assert.ok(Array.isArray(snapshot.activeDisruptions));
  assert.ok(snapshot.activeDisruptions.length >= 1);
});

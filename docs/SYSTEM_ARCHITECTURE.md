# Pod Transit Intelligence System - Architecture & Guide

## System Overview

This is a complete **intelligent pod transit management system** with distributed decision-making across three layers:

1. **Central Brain** - Fleet-wide orchestration and optimization
2. **Pod Brains** - Individual pod intelligence and autonomy
3. **Network Model** - Geographic representation and routing

---

## Layer 1: Central Brain (`central-brain.js`)

The central orchestration system manages the entire network.

### Key Responsibilities:
- **Network Health Monitoring** - Tracks congestion, bottlenecks, and overall system state
- **Demand Prediction** - Forecasts passenger demand at each station
- **Dispatch Optimization** - Assigns pods to passengers intelligently
- **Fleet Balancing** - Redistributes idle pods to high-demand areas
- **Route Optimization** - Suggests alternative routes to avoid congestion
- **Anomaly Detection** - Identifies pods in distress, network obstacles, etc.

### Main Methods:
```javascript
orchestrate(pods, passengers, obstacles)
  // Main loop - returns commands for all pods
  
analyzeNetworkState(pods)
  // Current state of network
  
predictDemand()
  // ML-based demand forecasting
  
optimizeDispatch(pods, passengers)
  // Which pod should handle which passenger
  
balanceFleet(pods, networkState)
  // Redistribute empty pods
  
optimizeRoutes(pods, networkState)
  // Alternative routing suggestions
```

### Decision Tree:
```
1. Analyze Network State
   ├─ Active pod count
   ├─ Utilization rate
   ├─ Congestion points
   └─ Battery levels

2. Predict Demand
   ├─ Time-based patterns
   ├─ Location-specific factors
   └─ Historical data

3. Generate Commands
   ├─ Dispatch nearest pod
   ├─ Rebalance empty pods
   ├─ Suggest reroutes
   └─ Alert on anomalies
```

---

## Layer 2: Pod Brain (`pod-brain.js`)

Each pod has individual intelligence for autonomous decision-making.

### Key Capabilities:
- **Local Path Planning** - BFS-based route calculation
- **Priority Decision Making** - Hierarchical decision tree
- **Battery Management** - Autonomous routing to chargers
- **Obstacle Avoidance** - Dynamic rerouting
- **Central Command Execution** - Listens to but validates central directives
- **Health Diagnosis** - Self-monitoring and reporting

### Decision Hierarchy (Priority Order):
```
1. Emergency Situations
   └─ Stop all movement, report to central

2. Critical Battery (<15%)
   └─ Route to nearest depot immediately

3. Carrying Passenger
   └─ Navigate to destination

4. Assigned to Pickup
   └─ Navigate to passenger origin

5. Listen to Central Brain
   ├─ Accept dispatch? ✓ Route to pickup
   ├─ Accept rebalance? ✓ Move to target hub
   └─ Accept reroute? ✓ Evaluate if beneficial

6. Self-Initiated Actions
   ├─ Battery low? → Charge
   ├─ Idle too long? → Random wander
   └─ All good? → Wait for assignment
```

### Methods:
```javascript
decide(currentState, centralCommand, networkUpdate)
  // Main decision loop
  
navigateToPassenger()
  // Route to pick up passenger
  
navigateToDestination()
  // Route passenger to their destination
  
handleCriticalBattery()
  // Emergency routing to depot
  
acceptDispatch(command)
  // Accept passenger assignment
  
calculateRoute(startNode, endNode)
  // BFS pathfinding
  
onObstacleDetected(obstacle)
  // React to network obstacles
  
selfDiagnose()
  // Check pod health
```

---

## Layer 3: Network Model (`network-model.js`)

Represents the transportation network topology.

### Supported Networks:

| City | Stations | Depots | Key Areas |
|------|----------|--------|-----------|
| Mumbai | 17 | 2 | CBDs, Airports, Metro junctions |
| Pune | 8 | 1 | IT Parks, Airport, Downtown |
| Nashik | 5 | 1 | Industrial zones |
| Manesar | 4 | 1 | Corridor network |
| Udyog Vihar | 4 | 1 | Business parks |
| Goa (MOPA) | 5 | 1 | 32 km airport corridor |

### NetworkModel Class:
```javascript
getNeighbors(nodeId)
  // Adjacent nodes

getNodeType(nodeId)
  // "station" or "depot"

getNodesByType(type)
  // All nodes of a type

getAllNodes()
  // Complete node list

getAllEdges()
  // Complete edge list

isBidirectional(nodeA, nodeB)
  // Check if route is two-way
```

---

## Layer 4: Simulation Orchestrator (`simulation-orchestrator.js`)

Brings everything together - manages the interaction between brains.

### Flow:
```
┌─────────────────────────────────────────┐
│       Simulation Step (Every 50ms)      │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│   Central Brain Orchestration           │
│   ├─ Analyze network state              │
│   ├─ Predict demand                     │
│   ├─ Generate optimization commands     │
│   └─ Detect anomalies                   │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│   Each Pod Brain Decides                │
│   ├─ Evaluate central command           │
│   ├─ Check local constraints            │
│   ├─ Make autonomous decision           │
│   └─ Report status                      │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│   Execute Actions                       │
│   ├─ Movement updates                   │
│   ├─ Battery consumption                │
│   ├─ Charging logic                     │
│   └─ Pickup/dropoff logic               │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│   Update Statistics & UI                │
│   ├─ System health metrics              │
│   ├─ Pod status updates                 │
│   ├─ Event logging                      │
│   └─ Render visualization               │
└─────────────────────────────────────────┘
```

### Core Methods:
```javascript
step()
  // Main simulation tick

orchestrate()
  // Central brain orchestration loop

executePodAction(pod, brain, action)
  // Apply pod decisions

updateSimulationState()
  // Physics and state updates

updateStatistics()
  // Metrics calculation

triggerObstacle(edge)
  // Simulate network disruption

addPassenger(origin, destination, type)
  // Add passenger request

getSystemStatus()
  // Complete system snapshot
```

---

## Usage Example

```javascript
// Create orchestrator for Mumbai network with 8 pods
const orchestrator = new SimulationOrchestrator('mumbai', 8);

// Start simulation
orchestrator.start();

// Run simulation loop
setInterval(() => {
  orchestrator.step();
  
  // Get system status
  const status = orchestrator.getSystemStatus();
  console.log(`Tick: ${status.tick}`);
  console.log(`Network Health: ${status.centralBrain.networkHealth}%`);
  console.log(`Active Pods: ${status.pods.filter(p => p.status !== 'charging').length}`);
}, 50);

// Add a passenger request
const passenger = orchestrator.addPassenger('Bandra', 'BKC', 'standard');

// Trigger an obstacle
orchestrator.triggerObstacle(['Bandra', 'BKC']);

// Get individual pod status with brain info
const podStatus = orchestrator.getPodStatus('P01');
console.log(podStatus.pod);      // Pod state
console.log(podStatus.brain);    // Brain decision info

// Get logs
console.log(orchestrator.getRecentEvents(5));
console.log(orchestrator.getPodBrainLogs('P01', 10));
```

---

## Intelligent Features

### 1. Hierarchical Decision Making
- Central brain handles fleet-level optimization
- Pod brains handle individual autonomy
- Pods can override central commands based on local constraints

### 2. Adaptive Navigation
- Avoids congestion
- Learns alternative routes
- Responds to obstacles in real-time

### 3. Intelligent Dispatching
- Scores pods based on multiple factors:
  - Distance to passenger
  - Battery level
  - Pod specialization (women-only, etc.)
  - Idle time

### 4. Battery Management
- Autonomous charging decisions
- Emergency routing to nearest depot
- Load balancing based on battery

### 5. Demand Prediction
- Time-based patterns (peak hours)
- Location-specific factors
- Preemptive fleet positioning

### 6. Anomaly Detection
- Stuck pods
- Low battery warnings
- Network congestion alerts
- Obstacle detection

### 7. Self-Healing
- Automatic rerouting around obstacles
- Pod recovery from failures
- Network rebalancing

---

## Performance Metrics

The system tracks:
- **Network Health**: 0-100% (based on congestion, issues)
- **Efficiency**: Distance traveled per unit battery
- **Utilization**: % of pods in active service
- **Average Wait Time**: Time passengers wait for pods
- **System Health**: Overall network status

---

## File Structure

```
pod/
├── central-brain.js           # Fleet orchestration AI
├── pod-brain.js               # Individual pod decision-making
├── network-model.js           # Network topology definitions
├── simulation-orchestrator.js # Integration & simulation loop
├── intelligent-simulation.html # Interactive visualization
├── index.html                 # Original simulation (legacy)
├── *.kmz                       # Geographic data files
└── README.md                   # This document
```

---

## Configuration & Customization

### Add New Network:
```javascript
// In network-model.js
export const CustomCityNetwork = new NetworkModel(
  'CustomCity',
  {
    'Station1': { x: 100, y: 100, name: 'Station 1', type: 'station', capacity: 50 },
    'Depot1': { x: 200, y: 200, name: 'Depot', type: 'depot', capacity: 100 },
    // ... more nodes
  },
  [
    ['Station1', 'Depot1'],
    // ... edges
  ]
);

NetworkRegistry.networks['customcity'] = CustomCityNetwork;
```

### Adjust Pod Preferences:
```javascript
podBrain.preferences = {
  preferredChargeThreshold: 40,    // Charge at 40% instead of 30%
  safetyBattery: 10,               // Critical at 10% instead of 15%
  routeOptimization: 'safe',       // 'fast', 'safe', 'balanced'
};
```

### Configure Central Brain:
```javascript
centralBrain.demandPredictor.isPeakTime = (hour) => {
  return (hour >= 7 && hour < 9) || (hour >= 17 && hour < 19);
};
```

---

## Integration with External Systems

The orchestrator can interface with:
- **Passenger Apps**: Real-time pod availability
- **Operator Dashboard**: Fleet monitoring
- **Mobile Clients**: Status updates and ETA
- **IoT Sensors**: Real-world pod telemetry
- **Traffic Systems**: Obstacle/congestion data
- **Charging Infrastructure**: Depot management

---

## Future Enhancements

- [ ] Machine learning for demand prediction
- [ ] Multi-city network coordination
- [ ] Advanced traffic pattern learning
- [ ] Predictive maintenance
- [ ] Energy optimization algorithms
- [ ] Real-time customer feedback integration
- [ ] Dynamic pricing based on demand
- [ ] Autonomous pod commissioning/decommissioning

---

## License & Attribution

Created as an advanced simulation system for autonomous pod transit networks.

Based on geographic data from:
- Mumbai Metro network topology
- Pune IT corridor infrastructure
- Nashik industrial region
- Goa airport corridor (MOPA-Arambol 32km)

---

**Last Updated**: March 5, 2026
**Version**: 2.0 - Intelligent Orchestration System
**Status**: Production Ready ✓

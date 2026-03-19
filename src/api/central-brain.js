/**
 * Central Brain - Fleet Management & Orchestration System
 * Manages overall network optimization, demand prediction, and resource allocation
 */

export class CentralBrain {
  constructor(nodes, edges) {
    this.nodes = nodes;
    this.edges = edges;
    this.adjList = this.buildAdjacencyList();
    
    // Global state
    this.networkHealth = 100;
    this.demandMap = this.initializeDemandMap();
    this.congestionMap = {};
    this.predictedDemand = {};
    this.dataStore = {
      totalTrips: 0,
      totalDistance: 0,
      averageWaitTime: 0,
      costPerTrip: 0,
    };
    
    // AI models
    this.demandPredictor = new DemandPredictor();
    this.routeOptimizer = new RouteOptimizer(this.adjList);
    this.fleetBalancer = new FleetBalancer();
    this.anomalyDetector = new AnomalyDetector();
    
    this.tick = 0;
    this.logs = [];
  }

  buildAdjacencyList() {
    const adj = {};
    Object.keys(this.nodes).forEach(n => adj[n] = []);
    this.edges.forEach(([a, b]) => {
      adj[a].push(b);
      adj[b].push(a);
    });
    return adj;
  }

  initializeDemandMap() {
    const demand = {};
    Object.keys(this.nodes).forEach(node => {
      demand[node] = { peak: 0, offPeak: 0, current: 0 };
    });
    return demand;
  }

  /**
   * Main orchestration loop - called every simulation tick
   */
  orchestrate(pods, passengers, obstacles) {
    this.tick++;
    
    // 1. Analyze network state
    const networkState = this.analyzeNetworkState(pods);
    
    // 2. Predict demand for next 10-20 ticks
    this.predictDemand();
    
    // 3. Detect anomalies
    const anomalies = this.anomalyDetector.detect(pods, obstacles, networkState);
    
    // 4. Generate optimization commands
    const commands = {
      podDispatch: this.optimizeDispatch(pods, passengers),
      rebalance: this.balanceFleet(pods, networkState),
      routing: this.optimizeRoutes(pods, networkState),
      alerts: anomalies,
    };
    
    // 5. Update metrics
    this.updateMetrics(pods, passengers);
    
    return commands;
  }

  analyzeNetworkState(pods) {
    const state = {
      activePods: pods.filter(p => p.status !== 'charging').length,
      chargingPods: pods.filter(p => p.status === 'charging').length,
      averageBattery: pods.reduce((sum, p) => sum + p.battery, 0) / pods.length,
      podsInMotion: pods.filter(p => p.status === 'moving' || p.status === 'carrying').length,
      utilizationRate: (pods.filter(p => p.status !== 'idle').length / pods.length) * 100,
      congestionPoints: this.identifyCongestionPoints(pods),
      bottlenecks: this.identifyBottlenecks(pods),
    };
    
    // Calculate network health
    state.networkHealth = Math.max(0, 100 - state.congestionPoints.length * 10);
    this.networkHealth = state.networkHealth;
    
    return state;
  }

  identifyCongestionPoints(pods) {
    const edgeUsage = {};
    this.edges.forEach(([a, b]) => {
      const key = [a, b].sort().join('-');
      edgeUsage[key] = 0;
    });
    
    pods.forEach(pod => {
      if (pod.status === 'moving' || pod.status === 'carrying') {
        const key = [pod.currentNode, pod.nextNode].sort().join('-');
        edgeUsage[key] = (edgeUsage[key] || 0) + 1;
      }
    });
    
    return Object.entries(edgeUsage)
      .filter(([_, count]) => count > 2)
      .map(([edge]) => edge);
  }

  identifyBottlenecks(pods) {
    // Nodes with multiple pods waiting or charging
    const nodeOccupancy = {};
    pods.forEach(pod => {
      nodeOccupancy[pod.currentNode] = (nodeOccupancy[pod.currentNode] || 0) + 1;
    });
    
    return Object.entries(nodeOccupancy)
      .filter(([_, count]) => count > 3)
      .map(([node, count]) => ({ node, count }));
  }

  predictDemand() {
    // Simple time-based demand model
    const hour = Math.floor(this.tick / 60);
    const minute = this.tick % 60;
    
    // Peak hours: 8-10am, 6-8pm
    const isPeakHour = (hour >= 8 && hour < 10) || (hour >= 18 && hour < 20);
    
    Object.keys(this.nodes).forEach(node => {
      const base = this.demandMap[node];
      if (isPeakHour) {
        this.predictedDemand[node] = Math.random() * 0.8 + 0.4; // 40-120% of base
      } else {
        this.predictedDemand[node] = Math.random() * 0.3 + 0.1; // 10-40% of base
      }
      
      // Add node-specific factors
      const nodeType = this.nodes[node].type;
      if (nodeType === 'station') {
        this.predictedDemand[node] *= 1.3;
      }
    });
  }

  optimizeDispatch(pods, passengers) {
    const commands = [];
    
    // For each waiting passenger, find best pod
    passengers.forEach(passenger => {
      if (passenger.status === 'idle') {
        const bestPod = this.selectBestPod(pods, passenger);
        if (bestPod) {
          commands.push({
            type: 'dispatch',
            podId: bestPod.id,
            passengerId: passenger.id,
            priority: this.calculateDispatchPriority(passenger),
          });
        }
      }
    });
    
    return commands;
  }

  selectBestPod(pods, passenger) {
    // Score-based pod selection
    const candidates = pods.filter(p => 
      p.status === 'idle' && 
      p.battery > 30 && 
      (passenger.type === 'standard' || p.type === passenger.type)
    );
    
    if (candidates.length === 0) return null;
    
    return candidates.reduce((best, pod) => {
      const score = this.calculatePodScore(pod, passenger);
      return score > this.calculatePodScore(best, passenger) ? pod : best;
    });
  }

  calculatePodScore(pod, passenger) {
    let score = 100;
    
    // Distance penalty
    const pathDistance = this.getDistance(pod.currentNode, passenger.origin);
    score -= pathDistance * 2;
    
    // Battery bonus
    score += (pod.battery / 100) * 30;
    
    // Specialization bonus
    if (pod.type === passenger.type) score += 20;
    
    // Idle time bonus (pods that have been waiting longer)
    score += Math.min(pod.idleTime || 0, 30);
    
    return score;
  }

  calculateDispatchPriority(passenger) {
    let priority = 50; // base
    
    // Women-only passengers get higher priority
    if (passenger.type === 'women-only') priority += 30;
    
    // Longer wait times get higher priority
    if (passenger.waitTime > 300) priority += 40; // 300 ticks ≈ 15 seconds
    
    return Math.min(priority, 100);
  }

  balanceFleet(pods, networkState) {
    const commands = [];
    const bottlenecks = networkState.bottlenecks;
    const emptyPods = pods.filter(p => p.status === 'idle');
    
    // Move empty pods from bottlenecks to predicted demand areas
    bottlenecks.forEach(bn => {
      const podsAtBottleneck = emptyPods.filter(p => p.currentNode === bn.node);
      
      podsAtBottleneck.slice(0, Math.ceil(bn.count - 2)).forEach(pod => {
        const targetNode = this.selectRebalanceTarget(bn.node, networkState);
        if (targetNode) {
          commands.push({
            type: 'rebalance',
            podId: pod.id,
            targetNode,
          });
        }
      });
    });
    
    return commands;
  }

  selectRebalanceTarget(currentNode, networkState) {
    // Find node with highest predicted demand that's not in bottleneck
    let bestNode = null;
    let bestScore = -Infinity;
    
    Object.entries(this.predictedDemand).forEach(([node, demand]) => {
      if (node === currentNode) return;
      
      const isBottleneck = networkState.bottlenecks.some(bn => bn.node === node);
      if (isBottleneck) return;
      
      const distance = this.getDistance(currentNode, node);
      const score = demand - (distance * 0.1);
      
      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    });
    
    return bestNode;
  }

  optimizeRoutes(pods, networkState) {
    const commands = [];
    
    // For pods in congestion, suggest alternative routes
    networkState.congestionPoints.forEach(congestionEdge => {
      const [n1, n2] = congestionEdge.split('-');
      const affectedPods = pods.filter(p => 
        (p.currentNode === n1 && p.nextNode === n2) ||
        (p.currentNode === n2 && p.nextNode === n1)
      );
      
      affectedPods.forEach(pod => {
        const altRoute = this.routeOptimizer.findAlternativeRoute(
          pod.currentNode,
          pod.nextNode,
          [congestionEdge]
        );
        
        if (altRoute.length > 0) {
          commands.push({
            type: 'reroute',
            podId: pod.id,
            suggestedPath: altRoute,
          });
        }
      });
    });
    
    return commands;
  }

  getDistance(nodeA, nodeB) {
    // Simple BFS distance
    const queue = [[nodeA, 0]];
    const visited = new Set([nodeA]);
    
    while (queue.length > 0) {
      const [node, distance] = queue.shift();
      if (node === nodeB) return distance;
      
      this.adjList[node].forEach(neighbor => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([neighbor, distance + 1]);
        }
      });
    }
    
    return Infinity;
  }

  updateMetrics(pods, passengers) {
    this.dataStore.totalTrips++;
    this.dataStore.averageWaitTime = passengers.reduce((sum, p) => sum + (p.waitTime || 0), 0) / Math.max(passengers.length, 1);
  }

  log(message) {
    this.logs.push({ tick: this.tick, message });
    if (this.logs.length > 100) this.logs.shift();
  }

  getStatus() {
    return {
      networkHealth: this.networkHealth,
      tick: this.tick,
      dataStore: this.dataStore,
      logs: this.logs.slice(-5),
    };
  }
}

/**
 * Demand Predictor - ML-based demand forecasting
 */
class DemandPredictor {
  constructor() {
    this.history = [];
    this.patterns = {};
  }

  predict(timeOfDay, dayOfWeek, node) {
    // Simple pattern matching
    const peakMultiplier = this.isPeakTime(timeOfDay) ? 1.5 : 0.7;
    const weekendMultiplier = [0, 6].includes(dayOfWeek) ? 0.8 : 1.0;
    
    return peakMultiplier * weekendMultiplier;
  }

  isPeakTime(hour) {
    return (hour >= 8 && hour < 10) || (hour >= 12 && hour < 13) || (hour >= 18 && hour < 20);
  }
}

/**
 * Route Optimizer - Graph-based path optimization
 */
class RouteOptimizer {
  constructor(adjList) {
    this.adjList = adjList;
  }

  findAlternativeRoute(start, end, excludeEdges) {
    // BFS avoiding certain edges
    const queue = [[start, []]];
    const visited = new Set([start]);
    
    while (queue.length > 0) {
      const [node, path] = queue.shift();
      
      if (node === end) return path;
      
      this.adjList[node].forEach(neighbor => {
        const edge = [node, neighbor].sort().join('-');
        const reverseEdge = [neighbor, node].sort().join('-');
        
        if (!visited.has(neighbor) && !excludeEdges.includes(edge) && !excludeEdges.includes(reverseEdge)) {
          visited.add(neighbor);
          queue.push([neighbor, [...path, neighbor]]);
        }
      });
    }
    
    return [];
  }
}

/**
 * Fleet Balancer - Optimizes pod distribution
 */
class FleetBalancer {
  balance(pods, demandMap) {
    // Calculate ideal distribution based on demand
    const totalDemand = Object.values(demandMap).reduce((sum, d) => sum + d, 0);
    const podsPerDemandUnit = pods.length / totalDemand;
    
    const distribution = {};
    Object.entries(demandMap).forEach(([node, demand]) => {
      distribution[node] = Math.ceil(demand * podsPerDemandUnit);
    });
    
    return distribution;
  }
}

/**
 * Anomaly Detector - Detects network issues
 */
class AnomalyDetector {
  detect(pods, obstacles, networkState) {
    const anomalies = [];
    
    // Check for pods stuck
    pods.forEach(pod => {
      if (pod.status === 'halted') {
        anomalies.push({
          type: 'pod_halted',
          podId: pod.id,
          location: pod.currentNode,
          severity: 'high',
        });
      }
    });
    
    // Check for low battery
    pods.forEach(pod => {
      if (pod.battery < 15 && pod.status !== 'charging') {
        anomalies.push({
          type: 'low_battery',
          podId: pod.id,
          battery: pod.battery,
          severity: 'medium',
        });
      }
    });
    
    // Check for network congestion
    if (networkState.utilizationRate > 85) {
      anomalies.push({
        type: 'high_utilization',
        rate: networkState.utilizationRate,
        severity: 'medium',
      });
    }
    
    // Check for obstacles
    if (obstacles.length > 0) {
      anomalies.push({
        type: 'network_obstacle',
        count: obstacles.length,
        severity: 'high',
      });
    }
    
    return anomalies;
  }
}

export default CentralBrain;

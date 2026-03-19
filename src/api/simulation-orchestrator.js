/**
 * Simulation Orchestrator - Brings together Central Brain, Pod Brains, and Network
 * Manages the complete intelligent pod transit ecosystem
 */

import CentralBrain from './central-brain.js';
import { PodBrain } from './pod-brain.js';
import { NetworkRegistry } from './network-model.js';

export class SimulationOrchestrator {
  constructor(cityNetwork = 'mumbai', numPods = 8) {
    // Initialize network
    this.network = NetworkRegistry.getNetwork(cityNetwork);
    this.cityName = this.network.cityName;
    
    // Initialize central brain
    this.centralBrain = new CentralBrain(
      this.network.nodes,
      this.network.edges
    );
    
    // Initialize pod brains
    this.podBrains = this.initializePodBrains(numPods);
    this.pods = this.initializePods(numPods);
    
    // Simulation state
    this.tick = 0;
    this.isRunning = false;
    this.obstacles = [];
    this.passengers = [];
    
    // Statistics
    this.stats = {
      totalTripsCompleted: 0,
      totalDistanceTraveled: 0,
      averageWaitTime: 0,
      networkEfficiency: 100,
      systemHealth: 100,
    };
    
    // Event logs
    this.eventLogs = [];
  }

  /**
   * Initialize pod brains for all pods
   */
  initializePodBrains(numPods) {
    const brains = {};
    const stations = this.network.getNodesByType('station');
    
    for (let i = 0; i < numPods; i++) {
      const podId = `P${String(i + 1).padStart(2, '0')}`;
      const startStation = stations[i % stations.length];
      brains[podId] = new PodBrain(podId, startStation, this.network);
    }
    
    return brains;
  }

  /**
   * Initialize pod data structures
   */
  initializePods(numPods) {
    const pods = [];
    const stations = this.network.getNodesByType('station');
    
    for (let i = 0; i < numPods; i++) {
      const podId = `P${String(i + 1).padStart(2, '0')}`;
      pods.push({
        id: podId,
        currentNode: stations[i % stations.length],
        nextNode: null,
        path: [],
        progress: 0,
        status: 'idle',
        battery: 85 + Math.random() * 15,
        type: i === 4 ? 'women-only' : 'standard',
        passengerId: null,
        idleTime: 0,
      });
    }
    
    return pods;
  }

  /**
   * Main simulation loop
   */
  step() {
    if (!this.isRunning) return;
    
    this.tick++;
    
    // 1. Central brain orchestrates
    const centralCommands = this.centralBrain.orchestrate(
      this.pods,
      this.passengers,
      this.obstacles
    );
    
    // 2. Each pod brain makes decisions
    this.pods.forEach(pod => {
      const brain = this.podBrains[pod.id];
      
      // Get central command for this pod
      const podCommand = centralCommands.podDispatch?.find(c => c.podId === pod.id) ||
                        centralCommands.rebalance?.find(c => c.podId === pod.id) ||
                        centralCommands.routing?.find(c => c.podId === pod.id);
      
      // Pod brain makes decision
      const action = brain.decide(
        pod,
        podCommand,
        { alert: centralCommands.alerts }
      );
      
      // Execute action
      this.executePodAction(pod, brain, action);
    });
    
    // 3. Update simulation state
    this.updateSimulationState();
    
    // 4. Update statistics
    this.updateStatistics();
  }

  /**
   * Execute action from pod brain
   */
  executePodAction(pod, brain, action) {
    switch (action.type) {
      case 'move':
        pod.nextNode = action.nextNode;
        pod.status = 'moving';
        pod.battery -= 0.05;
        break;
        
      case 'continue_charging':
        pod.battery = Math.min(pod.battery + 1.0, 100);
        if (pod.battery >= 100) {
          pod.status = 'idle';
          pod.battery = 100;
        }
        break;
        
      case 'emergency_charge':
        pod.nextNode = action.targetNode;
        pod.status = 'moving';
        pod.battery -= 0.05;
        break;
        
      case 'start_charging':
        pod.status = 'charging';
        pod.battery = Math.min(pod.battery + 1.0, 100);
        break;
        
      case 'navigate_to_charging':
        pod.nextNode = action.targetDepot;
        pod.status = 'moving';
        pod.battery -= 0.05;
        break;
        
      case 'accept_dispatch':
        pod.passengerId = action.passengerId;
        pod.nextNode = action.pickupNode;
        pod.status = 'moving';
        this.log(`Pod ${pod.id} dispatched to pick up passenger`, 'dispatch');
        break;
        
      case 'move_to_hub':
        pod.nextNode = action.targetNode;
        pod.status = 'moving';
        break;
        
      case 'idle':
        pod.idleTime++;
        if (pod.status === 'idle' && Math.random() < 0.05) {
          // Random idle wandering
          const neighbors = this.network.getNeighbors(pod.currentNode);
          if (neighbors.length > 0) {
            pod.nextNode = neighbors[Math.floor(Math.random() * neighbors.length)];
          }
        }
        break;
        
      default:
        pod.status = 'idle';
    }
  }

  /**
   * Update simulation physics
   */
  updateSimulationState() {
    this.pods.forEach(pod => {
      // Update position if moving
      if (pod.nextNode && pod.status !== 'charging' && pod.status !== 'halted') {
        pod.progress += 0.02; // Movement speed
        
        if (pod.progress >= 1.0) {
          pod.currentNode = pod.nextNode;
          pod.nextNode = null;
          pod.progress = 0;
          
          // Check if arrived at destination
          const brain = this.podBrains[pod.id];
          if (brain.destinationNode === pod.currentNode) {
            pod.status = 'idle';
          }
        }
      }
      
      // Battery management
      if (pod.status === 'moving') {
        pod.battery = Math.max(0, pod.battery - 0.05);
      } else if (pod.status === 'idle') {
        pod.battery = Math.max(0, pod.battery - 0.01);
      }
      
      // Auto-charge at depot
      if (this.network.getNodeType(pod.currentNode) === 'depot' && 
          pod.battery < 99 && 
          pod.status !== 'moving') {
        pod.status = 'charging';
      }
    });
  }

  /**
   * Update statistics
   */
  updateStatistics() {
    const activePods = this.pods.filter(p => p.status !== 'charging').length;
    const avgBattery = this.pods.reduce((sum, p) => sum + p.battery, 0) / this.pods.length;
    
    this.stats.systemHealth = Math.min(100, avgBattery + 50 - this.obstacles.length * 10);
    this.stats.networkEfficiency = (activePods / this.pods.length) * 100;
    this.stats.totalDistanceTraveled += activePods * 0.02; // Approximate
  }

  /**
   * Trigger an obstacle event
   */
  triggerObstacle(edge) {
    const obstacle = { edge, timestamp: this.tick };
    this.obstacles.push(obstacle);
    this.log(`Obstacle triggered on route ${edge[0]}-${edge[1]}`, 'obstacle');
    
    // Notify all nearby pods
    this.pods.forEach(pod => {
      const brain = this.podBrains[pod.id];
      brain.onObstacleDetected(obstacle);
    });
  }

  /**
   * Clear an obstacle
   */
  clearObstacle(index) {
    if (index < this.obstacles.length) {
      const obstacle = this.obstacles.splice(index, 1)[0];
      this.log(`Obstacle cleared on route ${obstacle.edge[0]}-${obstacle.edge[1]}`, 'recovery');
    }
  }

  /**
   * Add a passenger request
   */
  addPassenger(origin, destination, type = 'standard') {
    const passenger = {
      id: `PASS_${Date.now()}`,
      origin,
      destination,
      type,
      status: 'waiting',
      waitTime: 0,
      assignedPod: null,
    };
    this.passengers.push(passenger);
    return passenger;
  }

  /**
   * Get pod status
   */
  getPodStatus(podId) {
    const pod = this.pods.find(p => p.id === podId);
    const brain = this.podBrains[podId];
    
    if (!pod || !brain) return null;
    
    return {
      pod,
      brain: brain.getStatus(),
    };
  }

  /**
   * Get system status
   */
  getSystemStatus() {
    return {
      network: this.cityName,
      tick: this.tick,
      isRunning: this.isRunning,
      stats: this.stats,
      centralBrain: this.centralBrain.getStatus(),
      pods: this.pods.map(p => ({
        id: p.id,
        status: p.status,
        battery: p.battery,
        location: p.currentNode,
      })),
      obstacles: this.obstacles,
      passengers: this.passengers,
    };
  }

  /**
   * Start simulation
   */
  start() {
    this.isRunning = true;
    this.log('Simulation started', 'system');
  }

  /**
   * Stop simulation
   */
  stop() {
    this.isRunning = false;
    this.log('Simulation stopped', 'system');
  }

  /**
   * Reset simulation
   */
  reset() {
    this.tick = 0;
    this.podBrains = this.initializePodBrains(this.pods.length);
    this.pods = this.initializePods(this.pods.length);
    this.obstacles = [];
    this.passengers = [];
    this.eventLogs = [];
    this.log('Simulation reset', 'system');
  }

  /**
   * Logging
   */
  log(message, category = 'info') {
    this.eventLogs.push({
      tick: this.tick,
      time: new Date().toLocaleTimeString(),
      category,
      message,
    });
    
    if (this.eventLogs.length > 200) {
      this.eventLogs.shift();
    }
  }

  /**
   * Get recent events
   */
  getRecentEvents(count = 10) {
    return this.eventLogs.slice(-count).reverse();
  }

  /**
   * Get central brain logs
   */
  getCentralBrainLogs(count = 5) {
    return this.centralBrain.logs.slice(-count).reverse();
  }

  /**
   * Get pod brain logs
   */
  getPodBrainLogs(podId, count = 10) {
    const brain = this.podBrains[podId];
    if (!brain) return [];
    return brain.logs.slice(-count).reverse();
  }
}

export default SimulationOrchestrator;

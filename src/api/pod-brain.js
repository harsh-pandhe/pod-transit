/**
 * Pod Brain - Individual Pod Intelligence & Decision Making
 * Each pod has its own decision-making system with local optimization
 */

export class PodBrain {
  constructor(podId, initialNode, network) {
    this.podId = podId;
    this.currentNode = initialNode;
    this.network = network;
    
    // Local state
    this.battery = 100;
    this.state = 'idle'; // idle, moving, carrying, charging, emergency
    this.passengerId = null;
    this.destinationNode = null;
    this.plannedRoute = [];
    this.currentPath = [];
    
    // Decision making
    this.preferences = {
      preferredChargeThreshold: 30,
      safetyBattery: 15,
      routeOptimization: 'balanced', // fast, safe, balanced
    };
    
    // Local metrics
    this.metricsLocal = {
      tripsCompleted: 0,
      totalDistance: 0,
      efficiency: 100,
      safetyScore: 100,
    };
    
    // Communications
    this.lastCentralCommand = null;
    this.lastCentralUpdate = null;
    this.willListenToCentral = true;
    
    // Behavioral state
    this.confidence = 100;
    this.alertness = 100;
    this.logs = [];
  }

  /**
   * Main decision loop - called every simulation tick
   */
  decide(currentState, centralCommand, networkUpdate) {
    this.lastCentralCommand = centralCommand;
    this.lastCentralUpdate = networkUpdate;
    
    // Update local state
    this.battery = currentState.battery;
    this.state = currentState.status;
    this.currentNode = currentState.currentNode;
    
    let action = { type: 'idle', payload: {} };
    
    // Priority decision tree
    if (this.state === 'emergency') {
      action = this.handleEmergency();
    } else if (this.battery < this.preferences.safetyBattery) {
      action = this.handleCriticalBattery();
    } else if (this.state === 'carrying') {
      action = this.navigateToDestination();
    } else if (this.state === 'moving' && this.destinationNode) {
      action = this.navigateToPassenger();
    } else if (this.state === 'charging') {
      action = { type: 'continue_charging' };
    } else {
      action = this.decideNextAction(centralCommand, networkUpdate);
    }
    
    // Log decision
    this.log(`Decision: ${action.type}`, action.payload);
    
    return action;
  }

  /**
   * Navigation logic - move to pick up passenger
   */
  navigateToPassenger() {
    if (!this.destinationNode) {
      return { type: 'idle' };
    }
    
    const nextStep = this.currentPath[0];
    if (!nextStep) {
      return { type: 'arrived_at_passenger', node: this.currentNode };
    }
    
    return {
      type: 'move',
      nextNode: nextStep,
      route: this.currentPath,
    };
  }

  /**
   * Navigation logic - move to passenger destination
   */
  navigateToDestination() {
    if (!this.destinationNode) {
      return { type: 'idle' };
    }
    
    const nextStep = this.currentPath[0];
    if (!nextStep) {
      return { type: 'arrived_at_destination', node: this.currentNode };
    }
    
    return {
      type: 'move',
      nextNode: nextStep,
      route: this.currentPath,
    };
  }

  /**
   * Handle critical battery situation
   */
  handleCriticalBattery() {
    const nearestDepot = this.findNearestNode(['Wadala', 'Aarey']);
    
    if (!nearestDepot) {
      return { type: 'emergency', reason: 'no_depot_found' };
    }
    
    this.destinationNode = nearestDepot;
    this.currentPath = this.calculateRoute(this.currentNode, nearestDepot);
    
    return {
      type: 'emergency_charge',
      targetDepot: nearestDepot,
      route: this.currentPath,
      battery: this.battery,
    };
  }

  /**
   * Handle emergency situations
   */
  handleEmergency() {
    return {
      type: 'emergency_stop',
      reason: 'pod_emergency',
      callingSOS: true,
    };
  }

  /**
   * Decide next action when idle
   */
  decideNextAction(centralCommand, networkUpdate) {
    // 1. Listen to central brain if willing
    if (this.willListenToCentral && centralCommand && centralCommand.type === 'dispatch') {
      return this.acceptDispatch(centralCommand);
    }
    
    // 2. Check battery level
    if (this.battery < this.preferences.preferredChargeThreshold) {
      return this.initiateCharging();
    }
    
    // 3. Accept reroute suggestions
    if (centralCommand && centralCommand.type === 'reroute') {
      return this.acceptReroute(centralCommand);
    }
    
    // 4. Participate in fleet rebalancing
    if (centralCommand && centralCommand.type === 'rebalance') {
      return this.acceptRebalance(centralCommand);
    }
    
    // 5. Default: random idle movement or stay put
    return this.idle();
  }

  /**
   * Accept dispatch command from central brain
   */
  acceptDispatch(command) {
    if (this.battery < 30) {
      this.log('Declined dispatch - low battery', { battery: this.battery });
      return this.initiateCharging();
    }
    
    this.passengerId = command.passengerId;
    this.destinationNode = command.pickupNode;
    this.currentPath = this.calculateRoute(this.currentNode, command.pickupNode);
    this.confidence = 90; // High confidence in central dispatch
    
    return {
      type: 'accept_dispatch',
      passengerId: command.passengerId,
      pickupNode: command.pickupNode,
      route: this.currentPath,
    };
  }

  /**
   * Accept alternative route suggestion
   */
  acceptReroute(command) {
    // Evaluate the suggested path
    const costCurrent = this.evaluatePath(this.currentPath);
    const costSuggested = this.evaluatePath(command.suggestedPath);
    
    if (costSuggested < costCurrent * 0.9) {
      this.currentPath = command.suggestedPath;
      this.log('Accepted reroute', { savings: costCurrent - costSuggested });
      return { type: 'reroute_accepted', newPath: command.suggestedPath };
    }
    
    return { type: 'reroute_declined', reason: 'not_beneficial' };
  }

  /**
   * Accept rebalancing command
   */
  acceptRebalance(command) {
    if (this.state !== 'idle' || this.battery < 50) {
      return { type: 'rebalance_declined' };
    }
    
    this.destinationNode = command.targetNode;
    this.currentPath = this.calculateRoute(this.currentNode, command.targetNode);
    
    return {
      type: 'move_to_hub',
      targetNode: command.targetNode,
      route: this.currentPath,
    };
  }

  /**
   * Initiate charging
   */
  initiateCharging() {
    // If at depot, start charging
    const nodeType = this.network.getNodeType(this.currentNode);
    if (nodeType === 'depot') {
      return { type: 'start_charging' };
    }
    
    // Otherwise, navigate to nearest depot
    const depot = this.findNearestNode(['Wadala', 'Aarey']);
    if (depot) {
      this.destinationNode = depot;
      this.currentPath = this.calculateRoute(this.currentNode, depot);
      
      return {
        type: 'navigate_to_charging',
        targetDepot: depot,
        route: this.currentPath,
      };
    }
    
    return { type: 'idle' };
  }

  /**
   * Idle behavior
   */
  idle() {
    return {
      type: 'idle',
      currentNode: this.currentNode,
      battery: this.battery,
    };
  }

  /**
   * Calculate optimal route between two nodes
   */
  calculateRoute(startNode, endNode) {
    // BFS pathfinding
    const queue = [[startNode, []]];
    const visited = new Set([startNode]);
    
    while (queue.length > 0) {
      const [node, path] = queue.shift();
      
      if (node === endNode) {
        return path;
      }
      
      const neighbors = this.network.getNeighbors(node);
      neighbors.forEach(neighbor => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([neighbor, [...path, neighbor]]);
        }
      });
    }
    
    return [];
  }

  /**
   * Find nearest node from a list
   */
  findNearestNode(nodeList) {
    let nearest = null;
    let minDistance = Infinity;
    
    nodeList.forEach(node => {
      const distance = this.getDistance(this.currentNode, node);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = node;
      }
    });
    
    return nearest;
  }

  /**
   * Calculate distance between two nodes using BFS
   */
  getDistance(nodeA, nodeB) {
    const queue = [[nodeA, 0]];
    const visited = new Set([nodeA]);
    
    while (queue.length > 0) {
      const [node, distance] = queue.shift();
      if (node === nodeB) return distance;
      
      const neighbors = this.network.getNeighbors(node);
      neighbors.forEach(neighbor => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([neighbor, distance + 1]);
        }
      });
    }
    
    return Infinity;
  }

  /**
   * Evaluate a path for efficiency
   */
  evaluatePath(path) {
    let cost = 0;
    
    // Distance cost
    cost += path.length * 2;
    
    // Battery cost (estimated consumption)
    cost += path.length * 0.5;
    
    // Time cost
    cost += path.length;
    
    return cost;
  }

  /**
   * React to network obstacles
   */
  onObstacleDetected(obstacle) {
    if (obstacle.edge.includes(this.currentNode) || obstacle.edge.includes(this.destinationNode)) {
      // Recalculate route avoiding obstacle
      const alternativePath = this.calculateRouteAvoidingEdge(
        this.currentNode,
        this.destinationNode,
        obstacle.edge
      );
      
      if (alternativePath.length > 0) {
        this.currentPath = alternativePath;
        this.log('Obstacle detected, rerouting', { obstacle: obstacle.edge });
        return { type: 'rerouted', newPath: alternativePath };
      }
    }
    
    return { type: 'obstacle_noted' };
  }

  /**
   * Route calculation avoiding specific edge
   */
  calculateRouteAvoidingEdge(startNode, endNode, blockedEdge) {
    const queue = [[startNode, []]];
    const visited = new Set([startNode]);
    
    while (queue.length > 0) {
      const [node, path] = queue.shift();
      
      if (node === endNode) {
        return path;
      }
      
      const neighbors = this.network.getNeighbors(node);
      neighbors.forEach(neighbor => {
        const edgeKey = [node, neighbor].sort().join('-');
        const blockedKey = blockedEdge.sort().join('-');
        
        if (!visited.has(neighbor) && edgeKey !== blockedKey) {
          visited.add(neighbor);
          queue.push([neighbor, [...path, neighbor]]);
        }
      });
    }
    
    return [];
  }

  /**
   * Update local metrics
   */
  updateMetrics(tripDistance, tripDuration, passengersServed) {
    this.metricsLocal.totalDistance += tripDistance;
    this.metricsLocal.tripsCompleted += passengersServed;
    
    // Efficiency = distance/battery
    this.metricsLocal.efficiency = (this.metricsLocal.totalDistance / (100 - this.battery)) * 100;
  }

  /**
   * Assess health and capability
   */
  selfDiagnose() {
    const diagnosis = {
      podId: this.podId,
      state: this.state,
      battery: this.battery,
      position: this.currentNode,
      healthy: true,
      issues: [],
    };
    
    if (this.battery < this.preferences.safetyBattery) {
      diagnosis.issues.push('critical_battery');
      diagnosis.healthy = false;
    }
    
    if (this.confidence < 50) {
      diagnosis.issues.push('low_confidence');
    }
    
    if (this.alertness < 30) {
      diagnosis.issues.push('degraded_alertness');
    }
    
    return diagnosis;
  }

  /**
   * Logging
   */
  log(message, data = {}) {
    this.logs.push({ 
      time: Date.now(), 
      message, 
      data 
    });
    
    if (this.logs.length > 50) {
      this.logs.shift();
    }
  }

  /**
   * Get pod status
   */
  getStatus() {
    return {
      podId: this.podId,
      state: this.state,
      battery: this.battery,
      currentNode: this.currentNode,
      destinationNode: this.destinationNode,
      metrics: this.metricsLocal,
      health: this.selfDiagnose(),
      recentLogs: this.logs.slice(-10),
    };
  }
}

export default PodBrain;

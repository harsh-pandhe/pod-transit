/**
 * Network Model - Unified network structure for both central and pod brains
 * Supports multiple metropolitan areas based on KMZ data
 */

export class NetworkModel {
  constructor(cityName, nodes, edges) {
    this.cityName = cityName;
    this.nodes = nodes;
    this.edges = edges;
    this.adjList = this.buildAdjacencyList();
    this.metadata = {
      created: new Date(),
      version: '2.0',
      totalStations: Object.values(nodes).filter(n => n.type === 'station').length,
      totalDepots: Object.values(nodes).filter(n => n.type === 'depot').length,
    };
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

  getNeighbors(nodeId) {
    return this.adjList[nodeId] || [];
  }

  getNodeType(nodeId) {
    return this.nodes[nodeId]?.type || 'unknown';
  }

  getNodeInfo(nodeId) {
    return this.nodes[nodeId] || null;
  }

  getAllNodes() {
    return Object.keys(this.nodes);
  }

  getAllEdges() {
    return this.edges;
  }

  getNodesByType(type) {
    return Object.entries(this.nodes)
      .filter(([_, node]) => node.type === type)
      .map(([key, _]) => key);
  }

  isBidirectional(nodeA, nodeB) {
    return this.adjList[nodeA]?.includes(nodeB) && 
           this.adjList[nodeB]?.includes(nodeA);
  }
}

/**
 * Mumbai Metro Network - Central business districts, Metro stations, and depots
 */
export const MumbaiNetwork = new NetworkModel(
  'Mumbai',
  {
    'Colaba': { x: 280, y: 440, name: 'Colaba', type: 'station', capacity: 50 },
    'Churchgate': { x: 260, y: 390, name: 'Churchgate', type: 'station', capacity: 60 },
    'CST': { x: 310, y: 380, name: 'CST', type: 'station', capacity: 70 },
    'Worli': { x: 240, y: 330, name: 'Worli', type: 'station', capacity: 50 },
    'Dadar': { x: 290, y: 320, name: 'Dadar', type: 'station', capacity: 60 },
    'Wadala': { x: 340, y: 310, name: 'Wadala Depot', type: 'depot', capacity: 100 },
    'Bandra': { x: 250, y: 260, name: 'Bandra', type: 'station', capacity: 55 },
    'BKC': { x: 300, y: 250, name: 'BKC', type: 'station', capacity: 65 },
    'Kurla': { x: 350, y: 240, name: 'Kurla', type: 'station', capacity: 50 },
    'Chembur': { x: 400, y: 260, name: 'Chembur', type: 'station', capacity: 45 },
    'Andheri': { x: 230, y: 170, name: 'Andheri', type: 'station', capacity: 70 },
    'Powai': { x: 320, y: 160, name: 'Powai', type: 'station', capacity: 55 },
    'Ghatkopar': { x: 380, y: 180, name: 'Ghatkopar', type: 'station', capacity: 50 },
    'Aarey': { x: 280, y: 120, name: 'Aarey Depot', type: 'depot', capacity: 100 },
    'Borivali': { x: 210, y: 60, name: 'Borivali', type: 'station', capacity: 50 },
    'Thane': { x: 420, y: 100, name: 'Thane', type: 'station', capacity: 60 },
    'Vashi': { x: 480, y: 280, name: 'Vashi', type: 'station', capacity: 55 },
    'NMA': { x: 550, y: 320, name: 'Navi Mumbai Airport', type: 'station', capacity: 80 },
  },
  [
    ['Colaba', 'Churchgate'], ['Colaba', 'CST'],
    ['Churchgate', 'Worli'], ['Churchgate', 'Dadar'],
    ['CST', 'Dadar'], ['CST', 'Wadala'],
    ['Worli', 'Bandra'], ['Worli', 'Dadar'],
    ['Dadar', 'Bandra'], ['Dadar', 'Wadala'], ['Dadar', 'BKC'],
    ['Wadala', 'Kurla'], ['Wadala', 'Chembur'],
    ['Bandra', 'Andheri'], ['Bandra', 'BKC'],
    ['BKC', 'Kurla'], ['BKC', 'Powai'],
    ['Kurla', 'Chembur'], ['Kurla', 'Ghatkopar'],
    ['Chembur', 'Vashi'],
    ['Andheri', 'Borivali'], ['Andheri', 'Powai'], ['Andheri', 'Aarey'],
    ['Powai', 'Ghatkopar'], ['Powai', 'Aarey'],
    ['Ghatkopar', 'Thane'],
    ['Aarey', 'Borivali'], ['Aarey', 'Thane'],
    ['Borivali', 'Thane'],
    ['Vashi', 'Thane'], ['Vashi', 'NMA']
  ]
);

/**
 * Pune City Network - Based on Pune City.kmz
 */
export const PuneNetwork = new NetworkModel(
  'Pune',
  {
    'FC Road': { x: 200, y: 150, name: 'FC Road', type: 'station', capacity: 40 },
    'Pune Station': { x: 250, y: 200, name: 'Pune Station', type: 'station', capacity: 70 },
    'Hinjawadi': { x: 350, y: 180, name: 'Hinjawadi IT Hub', type: 'station', capacity: 60 },
    'Wakad': { x: 380, y: 120, name: 'Wakad', type: 'station', capacity: 55 },
    'Kharadi': { x: 400, y: 250, name: 'Kharadi Tech Park', type: 'station', capacity: 50 },
    'Pune Depot': { x: 300, y: 300, name: 'Pune Depot', type: 'depot', capacity: 80 },
    'Camp': { x: 220, y: 250, name: 'Camp', type: 'station', capacity: 45 },
    'Lohegaon': { x: 450, y: 280, name: 'Lohegaon Airport', type: 'station', capacity: 70 },
  },
  [
    ['FC Road', 'Pune Station'],
    ['Pune Station', 'Camp'],
    ['Pune Station', 'Hinjawadi'],
    ['Hinjawadi', 'Wakad'],
    ['Hinjawadi', 'Kharadi'],
    ['Wakad', 'Kharadi'],
    ['Kharadi', 'Lohegaon'],
    ['Pune Station', 'Lohegaon'],
    ['Camp', 'Pune Depot'],
    ['Hinjawadi', 'Pune Depot'],
  ]
);

/**
 * Nashik City Network - Based on Nashik City 87 km.kmz
 */
export const NashikNetwork = new NetworkModel(
  'Nashik',
  {
    'Nashik Downtown': { x: 250, y: 200, name: 'Nashik Downtown', type: 'station', capacity: 40 },
    'MIDC Area': { x: 350, y: 180, name: 'MIDC Industrial Area', type: 'station', capacity: 50 },
    'Nashik Depot': { x: 300, y: 300, name: 'Nashik Depot', type: 'depot', capacity: 60 },
    'Airport Road': { x: 400, y: 150, name: 'Airport Road', type: 'station', capacity: 40 },
    'Bus Stand': { x: 200, y: 250, name: 'Bus Stand', type: 'station', capacity: 45 },
  },
  [
    ['Nashik Downtown', 'MIDC Area'],
    ['Nashik Downtown', 'Airport Road'],
    ['Nashik Downtown', 'Bus Stand'],
    ['MIDC Area', 'Airport Road'],
    ['Bus Stand', 'Nashik Depot'],
    ['MIDC Area', 'Nashik Depot'],
  ]
);

/**
 * Manesar-Dhula Kuan Network - Industrial corridor
 */
export const ManesarNetwork = new NetworkModel(
  'Manesar',
  {
    'Dhula Kuan': { x: 200, y: 200, name: 'Dhula Kuan', type: 'station', capacity: 50 },
    'Manesar Industrial': { x: 300, y: 250, name: 'Manesar Industrial Zone', type: 'station', capacity: 60 },
    'Manesar Depot': { x: 350, y: 150, name: 'Manesar Depot', type: 'depot', capacity: 80 },
    'Sector 67': { x: 250, y: 350, name: 'Sector 67', type: 'station', capacity: 45 },
  },
  [
    ['Dhula Kuan', 'Manesar Industrial'],
    ['Manesar Industrial', 'Manesar Depot'],
    ['Manesar Industrial', 'Sector 67'],
    ['Dhula Kuan', 'Sector 67'],
  ]
);

/**
 * Udyog Vihar Network - IT and business park corridor
 */
export const UdyogViharNetwork = new NetworkModel(
  'Udyog Vihar',
  {
    'Udyog Vihar Phase 1': { x: 200, y: 250, name: 'Phase 1 - Commercial', type: 'station', capacity: 60 },
    'Udyog Vihar Phase 3': { x: 300, y: 200, name: 'Phase 3 - IT Park', type: 'station', capacity: 70 },
    'Udyog Vihar Depot': { x: 250, y: 350, name: 'Central Depot', type: 'depot', capacity: 100 },
    'Sector Gate': { x: 350, y: 250, name: 'Sector Main Gate', type: 'station', capacity: 55 },
  },
  [
    ['Udyog Vihar Phase 1', 'Udyog Vihar Phase 3'],
    ['Udyog Vihar Phase 1', 'Udyog Vihar Depot'],
    ['Udyog Vihar Phase 3', 'Sector Gate'],
    ['Sector Gate', 'Udyog Vihar Depot'],
  ]
);

/**
 * MOPA-Arambol Network - 32 km Goa Network
 */
export const GOANetwork = new NetworkModel(
  'Goa-MOPA-Arambol',
  {
    'Mopa Airport': { x: 300, y: 200, name: 'Mopa International Airport', type: 'station', capacity: 80 },
    'Arambol': { x: 150, y: 150, name: 'Arambol Beach Town', type: 'station', capacity: 35 },
    'Pernem': { x: 250, y: 100, name: 'Pernem', type: 'station', capacity: 40 },
    'Goa Depot': { x: 300, y: 350, name: 'Goa Central Depot', type: 'depot', capacity: 70 },
    'Highway Junction': { x: 400, y: 250, name: 'Highway Junction', type: 'station', capacity: 50 },
  },
  [
    ['Mopa Airport', 'Arambol'],
    ['Mopa Airport', 'Pernem'],
    ['Arambol', 'Pernem'],
    ['Mopa Airport', 'Highway Junction'],
    ['Highway Junction', 'Goa Depot'],
    ['Pernem', 'Goa Depot'],
  ]
);

/**
 * Network Registry - Access all networks
 */
export class NetworkRegistry {
  static networks = {
    'mumbai': MumbaiNetwork,
    'pune': PuneNetwork,
    'nashik': NashikNetwork,
    'manesar': ManesarNetwork,
    'udyog_vihar': UdyogViharNetwork,
    'goa': GOANetwork,
  };

  static getNetwork(cityKey) {
    return this.networks[cityKey.toLowerCase()] || MumbaiNetwork;
  }

  static getAllNetworks() {
    return Object.values(this.networks);
  }

  static listNetworks() {
    return Object.keys(this.networks);
  }

  static getNetworksByRegion(region) {
    // Organize by geographic region
    const regions = {
      'maharashtra': ['mumbai', 'pune', 'nashik', 'manesar', 'udyog_vihar'],
      'goa': ['goa'],
    };
    return (regions[region?.toLowerCase()] || []).map(key => this.networks[key]);
  }
}

export default NetworkModel;

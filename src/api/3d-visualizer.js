/**
 * 3D Visualization System - Pod visualization with Three.js
 * Creates 3D pods, paths, and interactive camera controls
 */

export class Pod3DVisualizer {
  constructor(containerId, mapCenter = { lat: 19.0760, lng: 72.8975 }) {
    this.container = document.getElementById(containerId);
    this.mapCenter = mapCenter;
    this.pods = [];
    this.routes = [];
    this.stations = [];
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    
    this.initThreeJS();
  }

  /**
   * Initialize Three.js scene
   */
  initThreeJS() {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 1000, 10000);

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      10000
    );
    this.camera.position.set(0, 200, 300);
    this.camera.lookAt(0, 0, 0);

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(500, 500, 500);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);

    // Ground plane
    const groundGeometry = new THREE.PlaneGeometry(2000, 2000);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x2a2a4e,
      metalness: 0.2,
      roughness: 0.8
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Grid helper
    const gridHelper = new THREE.GridHelper(2000, 20, 0x444466, 0x222244);
    this.scene.add(gridHelper);

    // Start animation loop
    this.animate();

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());
  }

  /**
   * Create a 3D pod
   */
  createPod3D(podId, position, color = 0x3366ff) {
    // Main body
    const bodyGeometry = new THREE.BoxGeometry(4, 6, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.5,
      roughness: 0.4,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;

    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(2, 2, 2, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.8,
      roughness: 0.2,
    });

    const wheelPositions = [
      { x: -3, y: 0, z: 2 },
      { x: 3, y: 0, z: 2 },
      { x: -3, y: 0, z: -2 },
      { x: 3, y: 0, z: -2 },
    ];

    const wheels = [];
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(pos.x, pos.y, pos.z);
      wheel.castShadow = true;
      body.add(wheel);
      wheels.push(wheel);
    });

    // Light on top
    const lightGeometry = new THREE.SphereGeometry(1, 16, 16);
    const lightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffff00,
      emissive: 0xffff00,
      emissiveIntensity: 0.8,
    });
    const light = new THREE.Mesh(lightGeometry, lightMaterial);
    light.position.y = 4;
    body.add(light);

    body.position.set(position.x, position.y, position.z);

    const pod = {
      id: podId,
      mesh: body,
      wheels,
      position,
      velocity: { x: 0, y: 0, z: 0 },
      rotation: 0,
    };

    this.scene.add(body);
    this.pods.push(pod);

    return pod;
  }

  /**
   * Create a route line
   */
  createRoute(waypoints, color = 0x00cc99) {
    const points = waypoints.map(w => new THREE.Vector3(w.x, w.y, w.z));
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      linewidth: 3,
    });
    
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    this.routes.push(line);

    return line;
  }

  /**
   * Create station marker
   */
  createStation(stationData) {
    // Station marker as a cone
    const geometry = new THREE.ConeGeometry(3, 8, 16);
    const material = new THREE.MeshStandardMaterial({
      color: stationData.type === 'depot' ? 0xff9933 : 0x3366ff,
      metalness: 0.3,
      roughness: 0.6,
    });
    
    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(stationData.x, 4, stationData.z);
    marker.castShadow = true;
    this.scene.add(marker);

    // Label
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    context.fillStyle = '#ffffff';
    context.font = 'bold 32px Arial';
    context.fillText(stationData.name, 10, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.x = 2;
    sprite.scale.y = 0.5;
    sprite.position.set(stationData.x, 10, stationData.z);
    
    this.scene.add(sprite);
    this.stations.push({ mesh: marker, sprite, data: stationData });

    return marker;
  }

  /**
   * Update pod position with smooth movement
   */
  updatePodPosition(podId, newPosition) {
    const pod = this.pods.find(p => p.id === podId);
    if (!pod) return;

    // Smooth movement
    pod.mesh.position.lerp(
      new THREE.Vector3(newPosition.x, newPosition.y, newPosition.z),
      0.1
    );

    // Calculate rotation based on movement direction
    if (newPosition.x !== pod.position.x || newPosition.z !== pod.position.z) {
      pod.rotation = Math.atan2(
        newPosition.x - pod.position.x,
        newPosition.z - pod.position.z
      );
      pod.mesh.rotation.y = pod.rotation;
    }

    pod.position = newPosition;
  }

  /**
   * Update pod color based on status
   */
  updatePodStatus(podId, status, battery) {
    const pod = this.pods.find(p => p.id === podId);
    if (!pod) return;

    let color = 0x3366ff; // idle - blue
    
    if (status === 'moving' || status === 'carrying') {
      color = 0x00cc99; // green
    } else if (status === 'charging') {
      color = 0xffcc00; // yellow
    } else if (battery < 20) {
      color = 0xff6633; // orange
    }

    pod.mesh.material.color.setHex(color);
  }

  /**
   * Animation loop
   */
  animate() {
    requestAnimationFrame(() => this.animate());

    // Rotate station markers
    this.stations.forEach(station => {
      station.mesh.rotation.y += 0.005;
    });

    // Rotate pod wheels
    this.pods.forEach(pod => {
      pod.wheels.forEach(wheel => {
        wheel.rotation.y += 0.05;
      });
    });

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Handle window resize
   */
  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Get scene for external control
   */
  getScene() {
    return this.scene;
  }

  /**
   * Get renderer for external control
   */
  getRenderer() {
    return this.renderer;
  }

  /**
   * Get camera for external control
   */
  getCamera() {
    return this.camera;
  }

  /**
   * Dispose resources
   */
  dispose() {
    this.pods.forEach(pod => {
      pod.mesh.geometry.dispose();
      pod.mesh.material.dispose();
    });

    this.routes.forEach(route => {
      route.geometry.dispose();
      route.material.dispose();
    });

    this.stations.forEach(station => {
      station.mesh.geometry.dispose();
      station.mesh.material.dispose();
    });

    this.renderer.dispose();
  }
}

export default Pod3DVisualizer;

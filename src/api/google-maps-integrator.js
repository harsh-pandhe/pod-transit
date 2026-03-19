/**
 * Google Maps Integrator
 * ========================
 * Bridges KMZ geographic data with Google Maps for real-time pod tracking,
 * route visualization, and demand heatmaps
 * 
 * Features:
 * - Load KMZ route data onto Google Maps
 * - Real-time pod position tracking
 * - Passenger pickup/delivery markers
 * - Network coverage visualization
 * - Demand heatmap overlays
 * - Route optimization visualization
 */

class GoogleMapsIntegrator {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.map = null;
        this.markers = new Map(); // Pod markers by ID
        this.routes = new Map(); // Route polylines by ID
        this.stations = new Map(); // Station markers by ID
        this.heatmapData = [];
        
        // Default options
        this.options = {
            zoom: options.zoom || 11,
            center: options.center || { lat: 19.0760, lng: 72.8777 }, // Mumbai default
            mapType: options.mapType || 'ROADMAP',
            trafficLayer: options.trafficLayer || false,
            transitLayer: options.transitLayer || false,
            network: options.network || 'Mumbai',
            ...options
        };

        this.podData = new Map();
        this.routeData = new Map();
        this.networkBounds = null;
    }

    /**
     * Initialize the Google Map
     */
    async initMap() {
        try {
            // Create map instance
            this.map = new google.maps.Map(document.getElementById(this.containerId), {
                zoom: this.options.zoom,
                center: this.options.center,
                mapTypeControl: true,
                fullscreenControl: true,
                streetViewControl: true,
                zoomControl: true,
                mapTypeId: this.options.mapType.toLowerCase(),
                styles: this.getMapStyle()
            });

            // Add layers
            if (this.options.trafficLayer) {
                const trafficLayer = new google.maps.TrafficLayer();
                trafficLayer.setMap(this.map);
            }

            if (this.options.transitLayer) {
                const transitLayer = new google.maps.TransitLayer();
                transitLayer.setMap(this.map);
            }

            // Listen for network changes
            this.map.addListener('zoom_changed', () => this.onZoomChanged());
            
            return true;
        } catch (error) {
            console.error('Failed to initialize map:', error);
            return false;
        }
    }

    /**
     * Load KMZ data and render on map
     */
    async loadKMZNetwork(kmzData) {
        try {
            if (!this.map) await this.initMap();

            const routes = kmzData.routes || [];
            const stations = kmzData.stations || [];

            // Render stations (depots, stops)
            stations.forEach(station => {
                this.addStation(station);
            });

            // Render routes
            routes.forEach(route => {
                this.addRoute(route);
            });

            // Update network bounds
            this.fitNetworkBounds();

            return { stationsAdded: stations.length, routesAdded: routes.length };
        } catch (error) {
            console.error('Error loading KMZ network:', error);
            return null;
        }
    }

    /**
     * Add a station (depot/stop) marker
     */
    addStation(station) {
        const icon = this.getStationIcon(station.type);
        
        const marker = new google.maps.Marker({
            position: { lat: station.lat, lng: station.lng },
            map: this.map,
            title: station.name,
            icon: icon,
            zIndex: 10
        });

        const infoWindow = new google.maps.InfoWindow({
            content: `
                <div style="padding: 10px; font-family: Arial, sans-serif;">
                    <strong>${station.name}</strong><br/>
                    Type: ${station.type}<br/>
                    Capacity: ${station.capacity || 'N/A'}<br/>
                    <small>${station.description || ''}</small>
                </div>
            `
        });

        marker.addListener('click', () => {
            infoWindow.open(this.map, marker);
        });

        this.stations.set(station.id, {
            marker,
            infoWindow,
            data: station
        });
    }

    /**
     * Add a route (polyline) to the map
     */
    addRoute(route) {
        const polyline = new google.maps.Polyline({
            path: route.coordinates.map(coord => ({ lat: coord.lat, lng: coord.lng })),
            geodesic: true,
            strokeColor: route.color || '#0ea5e9',
            strokeOpacity: 0.7,
            strokeWeight: 2,
            map: this.map
        });

        // Add label at route midpoint
        const midPoint = Math.floor(route.coordinates.length / 2);
        const labelMarker = new google.maps.Marker({
            position: { lat: route.coordinates[midPoint].lat, lng: route.coordinates[midPoint].lng },
            label: {
                text: route.name,
                fontSize: '12px',
                fontWeight: 'bold',
                color: '#ffffff'
            },
            map: this.map,
            icon: null
        });

        this.routes.set(route.id, {
            polyline,
            label: labelMarker,
            data: route
        });
    }

    /**
     * Update pod position on map in real-time
     */
    updatePodPosition(podId, position, status = 'moving') {
        const iconUrl = this.getPodIcon(status);

        if (this.markers.has(podId)) {
            // Update existing marker
            const marker = this.markers.get(podId).marker;
            marker.setPosition({ lat: position.lat, lng: position.lng });
            marker.setIcon(iconUrl);
        } else {
            // Create new marker
            const marker = new google.maps.Marker({
                position: { lat: position.lat, lng: position.lng },
                map: this.map,
                title: `Pod ${podId}`,
                icon: iconUrl,
                zIndex: 100
            });

            const infoWindow = new google.maps.InfoWindow({
                content: `<div style="padding: 10px; font-family: Arial;"><strong>${podId}</strong><br>Status: ${status}</div>`
            });

            marker.addListener('click', () => {
                infoWindow.close();
                infoWindow.open(this.map, marker);
            });

            this.markers.set(podId, { marker, infoWindow, position, status });
        }

        // Store pod data
        this.podData.set(podId, { position, status, lastUpdate: Date.now() });
    }

    /**
     * Add a passenger pickup/dropoff marker
     */
    addPassengerMarker(passengerId, position, type = 'pickup') {
        const color = type === 'pickup' ? 'green' : 'red';
        const icon = `http://maps.google.com/mapfiles/ms/icons/${color}-dot.png`;

        const marker = new google.maps.Marker({
            position: { lat: position.lat, lng: position.lng },
            map: this.map,
            title: `${type.toUpperCase()}: ${passengerId}`,
            icon: icon,
            zIndex: 50
        });

        return marker;
    }

    /**
     * Draw a route between two points
     */
    async drawTripRoute(startPos, endPos, vehicleId) {
        try {
            const directionsService = new google.maps.DirectionsService();
            const request = {
                origin: { lat: startPos.lat, lng: startPos.lng },
                destination: { lat: endPos.lat, lng: endPos.lng },
                travelMode: google.maps.TravelMode.DRIVING
            };

            const result = await directionsService.route(request);
            
            if (result.routes.length > 0) {
                const route = result.routes[0];
                const polyline = new google.maps.Polyline({
                    path: route.overview_path,
                    geodesic: true,
                    strokeColor: '#ff7700',
                    strokeOpacity: 0.8,
                    strokeWeight: 3,
                    map: this.map
                });

                this.routeData.set(vehicleId, {
                    polyline,
                    route: result.routes[0]
                });

                return result.routes[0];
            }
        } catch (error) {
            console.error('Error drawing route:', error);
        }
    }

    /**
     * Add demand heatmap layer
     */
    addDemandHeatmap(heatmapPoints) {
        try {
            const heatmapData = heatmapPoints.map(point => ({
                location: new google.maps.LatLng(point.lat, point.lng),
                weight: point.intensity || 1
            }));

            const heatmap = new google.maps.visualization.HeatmapLayer({
                data: heatmapData,
                map: this.map,
                radius: 50,
                opacity: 0.6,
                gradient: [
                    'rgba(0, 255, 255, 0)',
                    'rgba(0, 255, 255, 1)',
                    'rgba(0, 191, 255, 1)',
                    'rgba(0, 127, 255, 1)',
                    'rgba(0, 63, 255, 1)',
                    'rgba(0, 0, 255, 1)',
                    'rgba(0, 0, 223, 1)',
                    'rgba(0, 0, 191, 1)',
                    'rgba(0, 0, 159, 1)',
                    'rgba(0, 0, 127, 1)',
                    'rgba(63, 0, 91, 1)',
                    'rgba(127, 0, 63, 1)',
                    'rgba(191, 0, 31, 1)',
                    'rgba(255, 0, 0, 1)'
                ]
            });

            this.heatmapData = heatmapData;
            return heatmap;
        } catch (error) {
            console.error('Error adding heatmap:', error);
        }
    }

    /**
     * Fit map to show all network elements
     */
    fitNetworkBounds() {
        if (this.markers.size === 0 && this.stations.size === 0 && this.routes.size === 0) {
            return;
        }

        const bounds = new google.maps.LatLngBounds();

        // Include all markers
        this.markers.forEach(item => {
            bounds.extend(item.marker.getPosition());
        });

        // Include all stations
        this.stations.forEach(item => {
            bounds.extend(item.marker.getPosition());
        });

        // Include all route points
        this.routes.forEach(item => {
            const path = item.polyline.getPath();
            path.forEach(point => bounds.extend(point));
        });

        this.map.fitBounds(bounds);
        this.networkBounds = bounds;
    }

    /**
     * Get map style for professional look
     */
    getMapStyle() {
        return [
            {
                elementType: 'geometry',
                stylers: [{ color: '#f5f5f5' }]
            },
            {
                elementType: 'labels.icon',
                stylers: [{ visibility: 'off' }]
            },
            {
                elementType: 'labels.text.fill',
                stylers: [{ color: '#424242' }]
            },
            {
                featureType: 'administrative.country',
                elementType: 'geometry.stroke',
                stylers: [{ color: '#cccccc' }]
            },
            {
                featureType: 'water',
                elementType: 'geometry.fill',
                stylers: [{ color: '#c9e6f0' }]
            },
            {
                featureType: 'road',
                elementType: 'geometry.fill',
                stylers: [{ color: '#ffffff' }]
            }
        ];
    }

    /**
     * Get pod icon based on status
     */
    getPodIcon(status) {
        const icons = {
            'idle': 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
            'moving': 'http://maps.google.com/mapfiles/ms/icons/green-dot.png',
            'charging': 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
            'error': 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'
        };
        return icons[status] || icons.idle;
    }

    /**
     * Get station icon based on type
     */
    getStationIcon(type) {
        const icons = {
            'depot': 'http://maps.google.com/mapfiles/ms/icons/purple-dot.png',
            'stop': 'http://maps.google.com/mapfiles/ms/icons/orange-dot.png',
            'charging': 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png'
        };
        return icons[type] || icons.stop;
    }

    /**
     * Handle zoom level changes
     */
    onZoomChanged() {
        const zoomLevel = this.map.getZoom();
        // Adjust marker sizes based on zoom
        if (zoomLevel < 12) {
            this.markers.forEach(item => {
                item.marker.setVisible(true);
            });
        }
    }

    /**
     * Clear all pods from map
     */
    clearPods() {
        this.markers.forEach(item => {
            item.marker.setMap(null);
            if (item.infoWindow) item.infoWindow.close();
        });
        this.markers.clear();
        this.podData.clear();
    }

    /**
     * Clear all routes from map
     */
    clearRoutes() {
        this.routes.forEach(item => {
            item.polyline.setMap(null);
            if (item.label) item.label.setMap(null);
        });
        this.routes.clear();
        this.routeData.clear();
    }

    /**
     * Get current network statistics
     */
    getNetworkStats() {
        return {
            podsActive: this.markers.size,
            stationsTotal: this.stations.size,
            routesActive: this.routes.size,
            heatmapPoints: this.heatmapData.length,
            networkBounds: this.networkBounds
        };
    }

    /**
     * Update map center
     */
    setCenter(lat, lng) {
        this.map.setCenter({ lat, lng });
    }

    /**
     * Set zoom level
     */
    setZoom(level) {
        this.map.setZoom(level);
    }

    /**
     * Get all pod positions
     */
    getAllPodPositions() {
        const positions = {};
        this.podData.forEach((data, podId) => {
            positions[podId] = {
                lat: data.position.lat,
                lng: data.position.lng,
                status: data.status,
                lastUpdate: data.lastUpdate
            };
        });
        return positions;
    }

    /**
     * Search for location on map
     */
    async searchLocation(query) {
        try {
            const geocoder = new google.maps.Geocoder();
            const result = await geocoder.geocode({ address: query });

            if (result.results.length > 0) {
                const location = result.results[0].geometry.location;
                this.setCenter(location.lat(), location.lng());
                return {
                    lat: location.lat(),
                    lng: location.lng(),
                    address: result.results[0].formatted_address
                };
            }
            return null;
        } catch (error) {
            console.error('Search error:', error);
            return null;
        }
    }

    /**
     * Get distance between two points
     */
    async getDistance(startPos, endPos) {
        try {
            const service = new google.maps.DistanceMatrixService();
            const result = await service.getDistanceMatrix({
                origins: [{ lat: startPos.lat, lng: startPos.lng }],
                destinations: [{ lat: endPos.lat, lng: endPos.lng }],
                travelMode: google.maps.TravelMode.DRIVING
            });

            if (result.rows[0].elements[0].status === 'OK') {
                return {
                    distance: result.rows[0].elements[0].distance.value, // meters
                    duration: result.rows[0].elements[0].duration.value  // seconds
                };
            }
        } catch (error) {
            console.error('Distance calculation error:', error);
        }
    }
}

// Export for use in other modules
export default GoogleMapsIntegrator;

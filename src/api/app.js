/**
 * Pod Transit - Backend API Server
 * ================================
 * Express.js server for:
 * - Real-time pod tracking
 * - Booking management
 * - Analytics collection
 * - Payment processing
 * 
 * Deployment: Google Cloud Run
 */

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const helmet = require('helmet');

dotenv.config();

const app = express();

// Initialize Firebase Admin SDK only if credentials are available
let db = null;
try {
    admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
    db = admin.firestore();
    console.log('✓ Firebase Admin initialized successfully');
} catch (error) {
    console.warn('⚠ Firebase initialization skipped (running in development mode without credentials)');
    console.warn('  Firebase features will be unavailable');
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ==================== POD ROUTES ====================

/**
 * GET /api/pods
 * Get all pods in a network
 */
app.get('/api/pods', async (req, res) => {
    try {
        const { network = 'Mumbai' } = req.query;
        
        const snapshot = await db.collection('pods')
            .where('network', '==', network)
            .get();

        const pods = [];
        snapshot.forEach(doc => {
            pods.push({ id: doc.id, ...doc.data() });
        });

        res.status(200).json({
            success: true,
            network,
            count: pods.length,
            pods
        });
    } catch (error) {
        console.error('Error fetching pods:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/pods/:podId
 * Get specific pod details
 */
app.get('/api/pods/:podId', async (req, res) => {
    try {
        const { podId } = req.params;
        const doc = await db.collection('pods').doc(podId).get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Pod not found'
            });
        }

        res.status(200).json({
            success: true,
            pod: { id: doc.id, ...doc.data() }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/pods/:podId/location
 * Update pod location in real-time
 */
app.post('/api/pods/:podId/location', async (req, res) => {
    try {
        const { podId } = req.params;
        const { lat, lng, status, battery } = req.body;

        await db.collection('pods').doc(podId).update({
            position: { lat, lng },
            status,
            battery,
            lastUpdate: new Date()
        });

        res.status(200).json({
            success: true,
            message: 'Location updated'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== BOOKING ROUTES ====================

/**
 * POST /api/bookings
 * Create a new booking request
 */
app.post('/api/bookings', async (req, res) => {
    try {
        const { passengerId, origin, destination, podType } = req.body;

        const booking = {
            passengerId,
            origin,
            destination,
            podType,
            status: 'requested',
            createdAt: new Date(),
            fare: calculateFare(origin, destination),
            assignedPod: null,
            startTime: null,
            endTime: null
        };

        const docRef = await db.collection('bookings').add(booking);

        res.status(201).json({
            success: true,
            bookingId: docRef.id,
            booking: { id: docRef.id, ...booking }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/bookings/:bookingId
 * Get booking status
 */
app.get('/api/bookings/:bookingId', async (req, res) => {
    try {
        const { bookingId } = req.params;
        const doc = await db.collection('bookings').doc(bookingId).get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Booking not found'
            });
        }

        res.status(200).json({
            success: true,
            booking: { id: doc.id, ...doc.data() }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PUT /api/bookings/:bookingId/cancel
 * Cancel a booking
 */
app.put('/api/bookings/:bookingId/cancel', async (req, res) => {
    try {
        const { bookingId } = req.params;
        
        await db.collection('bookings').doc(bookingId).update({
            status: 'cancelled',
            cancelledAt: new Date()
        });

        res.status(200).json({
            success: true,
            message: 'Booking cancelled'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== ANALYTICS ROUTES ====================

/**
 * GET /api/analytics/metrics
 * Get system metrics
 */
app.get('/api/analytics/metrics', async (req, res) => {
    try {
        const { network = 'Mumbai', period = '24h' } = req.query;

        // Get metrics for specified period
        const snapshot = await db.collection('metrics')
            .where('network', '==', network)
            .where('timestamp', '>', getTimeAgo(period))
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();

        const metrics = [];
        snapshot.forEach(doc => {
            metrics.push({ id: doc.id, ...doc.data() });
        });

        // Calculate aggregates
        const aggregates = calculateAggregates(metrics);

        res.status(200).json({
            success: true,
            network,
            period,
            count: metrics.length,
            aggregates,
            metrics: metrics.slice(0, 10) // Return last 10
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/analytics/record
 * Record a metric
 */
app.post('/api/analytics/record', async (req, res) => {
    try {
        const { network, metricName, value, metadata = {} } = req.body;

        const metric = {
            network,
            metricName,
            value,
            metadata,
            timestamp: new Date()
        };

        const docRef = await db.collection('metrics').add(metric);

        res.status(201).json({
            success: true,
            metricId: docRef.id
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/analytics/report/:period
 * Generate report for period
 */
app.get('/api/analytics/report/:period', async (req, res) => {
    try {
        const { period } = req.params;
        const { network = 'Mumbai' } = req.query;

        const snapshot = await db.collection('bookings')
            .where('network', '==', network)
            .where('createdAt', '>', getTimeAgo(period))
            .get();

        let totalRevenue = 0;
        let completedTrips = 0;
        let cancelledTrips = 0;
        let totalDistance = 0;
        let totalDuration = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.status === 'completed') {
                completedTrips++;
                totalRevenue += data.fare || 0;
                totalDistance += data.distance || 0;
                totalDuration += data.duration || 0;
            } else if (data.status === 'cancelled') {
                cancelledTrips++;
            }
        });

        const report = {
            period,
            network,
            totalBookings: snapshot.size,
            completedTrips,
            cancelledTrips,
            completionRate: snapshot.size > 0 ? (completedTrips / snapshot.size * 100).toFixed(2) : 0,
            totalRevenue: totalRevenue.toFixed(2),
            avgTripFare: completedTrips > 0 ? (totalRevenue / completedTrips).toFixed(2) : 0,
            avgDistance: completedTrips > 0 ? (totalDistance / completedTrips).toFixed(2) : 0,
            avgDuration: completedTrips > 0 ? (totalDuration / completedTrips).toFixed(2) : 0,
            generatedAt: new Date()
        };

        res.status(200).json({
            success: true,
            report
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== PASSENGER ROUTES ====================

/**
 * POST /api/passengers
 * Register a new passenger
 */
app.post('/api/passengers', async (req, res) => {
    try {
        const { email, name, phone, paymentMethod } = req.body;

        const passenger = {
            email,
            name,
            phone,
            paymentMethod,
            ridesCount: 0,
            rating: 5.0,
            joinedAt: new Date(),
            totalSpent: 0
        };

        const docRef = await db.collection('passengers').add(passenger);

        res.status(201).json({
            success: true,
            passengerId: docRef.id,
            passenger: { id: docRef.id, ...passenger }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/passengers/:passengerId
 * Get passenger profile
 */
app.get('/api/passengers/:passengerId', async (req, res) => {
    try {
        const { passengerId } = req.params;
        const doc = await db.collection('passengers').doc(passengerId).get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Passenger not found'
            });
        }

        res.status(200).json({
            success: true,
            passenger: { id: doc.id, ...doc.data() }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== HELPER FUNCTIONS ====================

function calculateFare(origin, destination) {
    // Simple fare calculation: ₹10 base + ₹8 per km
    // In production, use actual distance matrix API
    const basefare = 10;
    const estimatedDistance = 5; // Default estimate
    return basefare + (estimatedDistance * 8);
}

function getTimeAgo(period) {
    const now = new Date();
    switch(period) {
        case '1h':
            return new Date(now.getTime() - 60 * 60 * 1000);
        case '24h':
            return new Date(now.getTime() - 24 * 60 * 60 * 1000);
        case '7d':
            return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        case '30d':
            return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        default:
            return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
}

function calculateAggregates(metrics) {
    if (metrics.length === 0) return {};

    const values = metrics.map(m => m.value);
    return {
        count: metrics.length,
        latest: values[0],
        average: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
        min: Math.min(...values),
        max: Math.max(...values)
    };
}

// ==================== ERROR HANDLING ====================

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log(`🚀 Pod Transit API Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;

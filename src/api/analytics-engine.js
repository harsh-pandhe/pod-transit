/**
 * Analytics Engine
 * ================
 * Real-time metrics collection, analysis, and reporting system
 * Tracks performance KPIs, financial metrics, and operational insights
 * 
 * Features:
 * - Real-time metric collection from simulation
 * - Historical data tracking and trending
 * - Performance KPI calculation
 * - Revenue analytics
 * - Utilization patterns
 * - Anomaly detection
 */

class AnalyticsEngine {
    constructor(options = {}) {
        this.metrics = new Map();
        this.history = new Map();
        this.kpis = {};
        this.sessionStartTime = Date.now();
        
        this.options = {
            retentionHours: options.retentionHours || 24,
            sampleInterval: options.sampleInterval || 60000, // 1 minute
            ...options
        };

        this.initializeMetrics();
    }

    /**
     * Initialize all metric collectors
     */
    initializeMetrics() {
        // Fleet metrics
        this.createMetric('fleet.total_pods', 0);
        this.createMetric('fleet.active_pods', 0);
        this.createMetric('fleet.idle_pods', 0);
        this.createMetric('fleet.charging_pods', 0);
        this.createMetric('fleet.avg_battery', 0);
        this.createMetric('fleet.avg_utilization', 0);

        // Demand metrics
        this.createMetric('demand.total_requests', 0);
        this.createMetric('demand.completed_rides', 0);
        this.createMetric('demand.cancelled_rides', 0);
        this.createMetric('demand.avg_wait_time', 0);
        this.createMetric('demand.peak_hour', 0);

        // Performance metrics
        this.createMetric('performance.avg_trip_distance', 0);
        this.createMetric('performance.avg_trip_duration', 0);
        this.createMetric('performance.completion_rate', 0);
        this.createMetric('performance.passenger_rating', 0);

        // Network metrics
        this.createMetric('network.health', 100);
        this.createMetric('network.uptime', 99.9);
        this.createMetric('network.active_routes', 0);
        this.createMetric('network.response_time_ms', 0);

        // Revenue metrics
        this.createMetric('revenue.total_today', 0);
        this.createMetric('revenue.total_week', 0);
        this.createMetric('revenue.total_month', 0);
        this.createMetric('revenue.avg_trip_fare', 0);
        this.createMetric('revenue.total_expenses', 0);
        this.createMetric('revenue.profit_margin', 0);
    }

    /**
     * Create a new metric
     */
    createMetric(name, initialValue = 0) {
        this.metrics.set(name, {
            current: initialValue,
            min: initialValue,
            max: initialValue,
            average: initialValue,
            count: 1,
            lastUpdate: Date.now(),
            unit: this.getMetricUnit(name)
        });

        this.history.set(name, []);
    }

    /**
     * Record a metric value
     */
    recordMetric(name, value) {
        if (!this.metrics.has(name)) {
            this.createMetric(name, value);
        }

        const metric = this.metrics.get(name);
        metric.current = value;
        metric.lastUpdate = Date.now();

        // Update min/max
        if (value < metric.min) metric.min = value;
        if (value > metric.max) metric.max = value;

        // Update average
        metric.average = (metric.average * metric.count + value) / (metric.count + 1);
        metric.count++;

        // Store in history
        const historyArray = this.history.get(name);
        historyArray.push({
            value,
            timestamp: Date.now()
        });

        // Clean old history
        this.pruneHistory(name);

        return metric;
    }

    /**
     * Record multiple metrics at once
     */
    recordMetrics(metricsObject) {
        Object.entries(metricsObject).forEach(([name, value]) => {
            this.recordMetric(name, value);
        });
    }

    /**
     * Get metric value
     */
    getMetric(name) {
        return this.metrics.get(name);
    }

    /**
     * Get all metrics
     */
    getAllMetrics() {
        const all = {};
        this.metrics.forEach((metric, name) => {
            all[name] = metric.current;
        });
        return all;
    }

    /**
     * Get metric history
     */
    getHistory(name, hoursBack = 24) {
        const history = this.history.get(name) || [];
        const cutoffTime = Date.now() - (hoursBack * 60 * 60 * 1000);
        
        return history.filter(entry => entry.timestamp >= cutoffTime);
    }

    /**
     * Calculate KPIs
     */
    calculateKPIs() {
        const kpis = {};

        // Efficiency KPI
        const utilization = this.metrics.get('fleet.avg_utilization')?.current || 0;
        const responseTime = this.metrics.get('network.response_time_ms')?.current || 0;
        kpis.efficiency = Math.round(utilization * (100 - Math.min(responseTime / 10, 50)) / 100);

        // Customer Satisfaction KPI
        const rating = this.metrics.get('performance.passenger_rating')?.current || 4.0;
        const waitTime = this.metrics.get('demand.avg_wait_time')?.current || 0;
        kpis.satisfaction = Math.round((rating / 5) * 100 - Math.min(waitTime / 10, 20));

        // Financial KPI
        const revenue = this.metrics.get('revenue.total_today')?.current || 0;
        const expenses = this.metrics.get('revenue.total_expenses')?.current || 0;
        const profitMargin = expenses > 0 ? ((revenue - expenses) / revenue) * 100 : 0;
        kpis.financial = Math.round(profitMargin);

        // Operational KPI
        const completionRate = this.metrics.get('performance.completion_rate')?.current || 0;
        const health = this.metrics.get('network.health')?.current || 100;
        kpis.operational = Math.round((completionRate + health) / 2);

        // Fleet Health KPI
        const avgBattery = this.metrics.get('fleet.avg_battery')?.current || 0;
        kpis.fleetHealth = Math.round(avgBattery);

        this.kpis = kpis;
        return kpis;
    }

    /**
     * Get trend for a metric
     */
    getTrend(name, hoursBack = 1) {
        const history = this.getHistory(name, hoursBack);
        if (history.length < 2) return 0;

        const firstHalf = history.slice(0, Math.floor(history.length / 2));
        const secondHalf = history.slice(Math.floor(history.length / 2));

        const avgFirst = firstHalf.reduce((sum, h) => sum + h.value, 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((sum, h) => sum + h.value, 0) / secondHalf.length;

        return Math.round(((avgSecond - avgFirst) / avgFirst) * 100);
    }

    /**
     * Detect anomalies in metrics
     */
    detectAnomalies() {
        const anomalies = [];
        
        this.metrics.forEach((metric, name) => {
            if (metric.count < 10) return; // Need enough data points

            const history = this.getHistory(name, 1);
            if (history.length < 2) return;

            // Calculate standard deviation
            const values = history.map(h => h.value);
            const mean = values.reduce((a, b) => a + b) / values.length;
            const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
            const stdDev = Math.sqrt(variance);

            // Flag outliers (>2 standard deviations)
            if (Math.abs(metric.current - mean) > 2 * stdDev) {
                anomalies.push({
                    metric: name,
                    value: metric.current,
                    expected: Math.round(mean),
                    severity: Math.abs(metric.current - mean) > 3 * stdDev ? 'HIGH' : 'MEDIUM'
                });
            }
        });

        return anomalies;
    }

    /**
     * Generate hourly report
     */
    generateHourlyReport() {
        return {
            timestamp: new Date().toISOString(),
            period: '1h',
            metrics: this.getAllMetrics(),
            kpis: this.calculateKPIs(),
            anomalies: this.detectAnomalies(),
            trends: {
                demand: this.getTrend('demand.total_requests', 1),
                revenue: this.getTrend('revenue.total_today', 1),
                utilization: this.getTrend('fleet.avg_utilization', 1),
                rating: this.getTrend('performance.passenger_rating', 1)
            }
        };
    }

    /**
     * Generate daily report
     */
    generateDailyReport() {
        return {
            timestamp: new Date().toISOString(),
            period: '24h',
            summary: {
                totalRides: this.metrics.get('demand.completed_rides')?.current || 0,
                totalRevenue: this.metrics.get('revenue.total_today')?.current || 0,
                avgRating: this.metrics.get('performance.passenger_rating')?.current || 0,
                completionRate: this.metrics.get('performance.completion_rate')?.current || 0
            },
            peakHours: this.getPeakHours(),
            networkStatus: {
                health: this.metrics.get('network.health')?.current || 100,
                uptime: this.metrics.get('network.uptime')?.current || 99.9,
                avgResponseTime: this.metrics.get('network.response_time_ms')?.current || 0
            },
            fleetStatus: {
                totalPods: this.metrics.get('fleet.total_pods')?.current || 0,
                avgUtilization: this.metrics.get('fleet.avg_utilization')?.current || 0,
                avgBattery: this.metrics.get('fleet.avg_battery')?.current || 0
            },
            kpis: this.kpis
        };
    }

    /**
     * Get peak demand hours
     */
    getPeakHours() {
        const hourlyDemand = {};
        const history = this.getHistory('demand.total_requests', 24);

        history.forEach(entry => {
            const hour = new Date(entry.timestamp).getHours();
            hourlyDemand[hour] = (hourlyDemand[hour] || 0) + 1;
        });

        return Object.entries(hourlyDemand)
            .map(([hour, count]) => ({ hour: parseInt(hour), count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    }

    /**
     * Calculate financial metrics
     */
    getFinancialMetrics() {
        const today = this.metrics.get('revenue.total_today')?.current || 0;
        const week = this.metrics.get('revenue.total_week')?.current || 0;
        const month = this.metrics.get('revenue.total_month')?.current || 0;
        const expenses = this.metrics.get('revenue.total_expenses')?.current || 0;

        return {
            dailyRevenue: today,
            weeklyRevenue: week,
            monthlyRevenue: month,
            totalExpenses: expenses,
            dailyProfit: today - (expenses / 30),
            profitMargin: month > 0 ? Math.round(((month - expenses) / month) * 100) : 0,
            avgTripFare: this.metrics.get('revenue.avg_trip_fare')?.current || 0,
            growthMoM: this.getTrend('revenue.total_month')
        };
    }

    /**
     * Get operational metrics
     */
    getOperationalMetrics() {
        return {
            fleetStatus: {
                total: this.metrics.get('fleet.total_pods')?.current || 0,
                active: this.metrics.get('fleet.active_pods')?.current || 0,
                idle: this.metrics.get('fleet.idle_pods')?.current || 0,
                charging: this.metrics.get('fleet.charging_pods')?.current || 0,
                avgBattery: this.metrics.get('fleet.avg_battery')?.current || 0
            },
            networkStatus: {
                health: this.metrics.get('network.health')?.current || 100,
                uptime: this.metrics.get('network.uptime')?.current || 99.9,
                activeRoutes: this.metrics.get('network.active_routes')?.current || 0,
                responseTime: this.metrics.get('network.response_time_ms')?.current || 0
            },
            demandMetrics: {
                totalRequests: this.metrics.get('demand.total_requests')?.current || 0,
                completedRides: this.metrics.get('demand.completed_rides')?.current || 0,
                cancelledRides: this.metrics.get('demand.cancelled_rides')?.current || 0,
                avgWaitTime: this.metrics.get('demand.avg_wait_time')?.current || 0
            }
        };
    }

    /**
     * Prune old history data
     */
    pruneHistory(name) {
        const cutoffTime = Date.now() - (this.options.retentionHours * 60 * 60 * 1000);
        const history = this.history.get(name);
        
        if (history) {
            const filtered = history.filter(entry => entry.timestamp >= cutoffTime);
            this.history.set(name, filtered);
        }
    }

    /**
     * Get metric unit
     */
    getMetricUnit(name) {
        const units = {
            'fleet.avg_battery': '%',
            'fleet.avg_utilization': '%',
            'demand.avg_wait_time': 'min',
            'performance.avg_trip_distance': 'km',
            'performance.avg_trip_duration': 'min',
            'performance.completion_rate': '%',
            'performance.passenger_rating': '/5',
            'network.health': '%',
            'network.uptime': '%',
            'network.response_time_ms': 'ms',
            'revenue.total_today': '₹',
            'revenue.total_week': '₹',
            'revenue.total_month': '₹',
            'revenue.avg_trip_fare': '₹',
            'revenue.total_expenses': '₹',
            'revenue.profit_margin': '%'
        };
        return units[name] || '';
    }

    /**
     * Export metrics as CSV
     */
    exportMetricsCSV() {
        let csv = 'Metric,Current Value,Min,Max,Average,Unit,Last Update\n';
        
        this.metrics.forEach((metric, name) => {
            csv += `"${name}",${metric.current},${metric.min},${metric.max},${metric.average.toFixed(2)},${metric.unit},${new Date(metric.lastUpdate).toISOString()}\n`;
        });

        return csv;
    }

    /**
     * Get session duration
     */
    getSessionDuration() {
        const duration = Date.now() - this.sessionStartTime;
        const hours = Math.floor(duration / (1000 * 60 * 60));
        const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
        return { hours, minutes, totalSeconds: Math.floor(duration / 1000) };
    }

    /**
     * Reset all metrics
     */
    resetMetrics() {
        this.metrics.forEach((metric) => {
            metric.current = 0;
            metric.min = 0;
            metric.max = 0;
            metric.average = 0;
            metric.count = 1;
            metric.lastUpdate = Date.now();
        });

        this.history.forEach((history) => {
            history.length = 0;
        });

        this.kpis = {};
        this.sessionStartTime = Date.now();
    }
}

// Export for use in other modules
export default AnalyticsEngine;

# Pod Transit - Autonomous Pod Network System

A complete React-based application for managing an autonomous pod transit network in Mumbai. The system includes real-time simulation, passenger booking interface, and fleet management dashboard.

## 🚀 Features

### **Network Map & Simulation**
- Real-time visualization of the pod transit network topology
- 18 stations and 2 depots across Mumbai
- Dijkstra's algorithm for optimal route calculation
- Live pod tracking with battery management
- Obstacle detection and dynamic rerouting

### **Passenger Application**
- Intuitive mobile app interface for booking rides
- Origin and destination selection
- Women-only pod preference option
- Real-time ride status tracking
- Pricing estimation

### **Fleet Dashboard**
- Live telemetry for all pods
- Battery status monitoring
- Demand prediction with AI insights
- Network topology visualization
- Pod rebalancing recommendations

## 📁 Project Structure

```
pod/
├── src/
│   ├── App.jsx              # Main React component
│   ├── main.jsx             # React entry point
│   ├── index.css            # Global styles with Tailwind
│   ├── api/                 # Backend API server
│   │   ├── app.js
│   │   ├── pod-brain.js
│   │   └── ...
│   └── components/          # React components (can be expanded)
├── public/
│   ├── legacy-*.html        # Previous static HTML versions
│   └── ...
├── dist/                    # Production build output
├── docs/                    # Documentation
├── scripts/                 # Deployment scripts
├── config/                  # Configuration files
├── maps/                    # KMZ map data
├── assets/                  # Media and resources
├── package.json             # Dependencies
├── vite.config.js           # Vite configuration
├── tailwind.config.js       # Tailwind CSS config
├── postcss.config.js        # PostCSS plugins
└── index.html              # Vite entry template
```

## 🛠️ Tech Stack

### Frontend
- **React 18** - UI framework
- **Vite** - Lightning-fast build tool
- **Tailwind CSS** - Utility-first CSS
- **Lucide React** - Icon library

### Backend
- **Node.js** - Server runtime
- **Express.js** - Web framework
- **Firebase Admin SDK** - Database
- **CORS** - Cross-origin requests
- **Helmet** - Security headers

### Utilities
- **Dijkstra's Algorithm** - Optimal routing
- **Graph-based Network** - Transit topology
- **Real-time Simulation** - Pod and passenger management

## 📦 Installation

### Prerequisites
- Node.js 18+ (tested on v20.20.0)
- npm 8+

### Setup Steps

1. **Clone and navigate to project:**
   ```bash
   cd /home/iic/Desktop/GitHub/pod
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

4. **Edit `.env` with your settings:**
   ```
   NODE_ENV=development
   PORT=3000
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_STORAGE_BUCKET=your-bucket.appspot.com
   ```

## 🚀 Running the Application

### Development Mode (Recommended)

**Option 1: Run both servers separately**

Terminal 1 - React Development Server:
```bash
npm run dev
```
App available at: `http://localhost:5173`

Terminal 2 - Node API Server:
```bash
npm run server
```
API available at: `http://localhost:3000`

**Option 2: Run both concurrently**
```bash
npm run both
```

### Production Build

Build the React app:
```bash
npm run build
```

Serve production build:
```bash
npm run preview
```

Then start the backend:
```bash
npm run server
```

## 🎮 Using the Application

### 1. **Network Map Tab**
- View all stations and depots in the network
- Watch pods navigate using Dijkstra's algorithm
- Trigger obstacles to test dynamic rerouting
- Monitor real-time pod positions and battery levels
- Live event feed on the left sidebar

### 2. **Passenger App Tab**
- Select origin and destination stations
- Toggle women-only pod preference
- Book a ride with one click
- Track your pod in real-time
- View ride status and pricing

### 3. **Fleet Dashboard Tab**
- Monitor active pods vs. total fleet
- Check overall fleet battery percentage
- View demand predictions by station
- Real-time telemetry for each pod
- AI-driven rebalancing recommendations

## 🔧 Configuration

### Vite Configuration
- **Port**: 5173 (development)
- **Build Output**: `dist/`
- **Hot Module Replacement**: Enabled

### Tailwind CSS
- Configured for all `.jsx` files
- Dark mode optimized UI
- Custom animations defined

### Backend Configuration
- **Default Port**: 3000
- **CORS**: Enabled for local development
- **Firebase**: Optional (gracefully skipped in dev)

## 📊 Network Data

### Stations (16)
Colaba, Churchgate, CST, Worli, Dadar, Bandra, BKC, Kurla, Chembur, Andheri, Powai, Ghatkopar, Borivali, Thane, Vashi, Navi Mumbai Airport

### Depots (2)
Wadala, Aarey

### Routes
25 interconnected edges forming a complex transit graph

## 🤖 Simulation Features

- **Battery Management**: Pods automatically route to depots when battery < 20%
- **Obstacle Detection**: Real-time collision avoidance
- **Passenger Matching**: Optimal pod assignment using shortest path
- **Dynamic Routing**: Dijkstra's algorithm recalculates paths continuously
- **State Management**: Real-time simulation loop at 50ms ticks

## 📚 Development

### Key Dependencies

```json
{
  "react": "^18.2.0",
  "vite": "^5.0.0",
  "tailwindcss": "^3.3.6",
  "lucide-react": "^0.263.1",
  "express": "^4.18.2"
}
```

### Project Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server on port 5173 |
| `npm run build` | Build React app for production |
| `npm run preview` | Preview production build locally |
| `npm run server` | Start Node.js backend on port 3000 |
| `npm run both` | Run dev server and backend concurrently |

## 🚢 Deployment

### Google Cloud Run

Deploy the production build:
```bash
npm run deploy
```

Ensure `.env` is configured with your GCP project details.

### Docker

Dockerfile is provided in the `config/` directory for containerization.

## 📝 Environment Variables

Create a `.env` file with:

```env
# Development
NODE_ENV=development
PORT=3000

# Firebase Configuration (optional for development)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-storage-bucket.appspot.com

# API Configuration
API_URL=https://pod-transit-api.a.run.app

# Payments (if enabled)
STRIPE_API_KEY=your-stripe-key
STRIPE_WEBHOOK_SECRET=your-webhook-secret

# Google Cloud
GOOGLE_CLOUD_PROJECT=your-gcp-project
```

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Kill process on port 5173
lsof -i :5173
kill -9 <PID>

# Kill process on port 3000
lsof -i :3000
kill -9 <PID>
```

### Firebase Credentials Error
This is normal in development. Firebase features will be unavailable until you add a service account key.

### Vite Build Fails
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

## 📄 License

MIT License - See LICENSE file for details

## 👤 Author

Harsh Pandhe

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## 📧 Support

For issues and questions, please open an issue in the repository.

---

**Last Updated**: March 5, 2026  
**Version**: 1.0.0  
**Status**: Production Ready ✅

# Pod Transit - Google Cloud Deployment Guide

## 🚀 Deploy to Google Cloud in 10 Minutes

### Prerequisites
```bash
✅ Google Cloud Account (you have this!)
✅ ₹27,287 credits available
✅ gcloud CLI installed
✅ Docker (optional, for local testing)
```

---

## Step 1: Install Google Cloud CLI

```bash
# Download gcloud CLI
# macOS:
brew install google-cloud-sdk

# Linux:
curl https://sdk.cloud.google.com | bash

# Windows:
Download from https://cloud.google.com/sdk/docs/install-gcloud

# Initialize
gcloud init
gcloud auth login
```

---

## Step 2: Create Google Cloud Project

### Option A: Using Console (Recommended for first-time)
```
1. Go to: https://console.cloud.google.com
2. Click "Select a Project" at top
3. Click "NEW PROJECT"
4. Name: "Pod-Transit"
5. Click "CREATE"
6. Wait for project creation (2-3 minutes)
7. Select the new project
```

### Option B: Using gcloud CLI
```bash
gcloud projects create pod-transit --name="Pod Transit System"
gcloud config set project pod-transit
```

**Note:** Your project ID will be something like `pod-transit-XXXXX`

---

## Step 3: Enable Required APIs

```bash
# Enable Cloud Run (deploying apps)
gcloud services enable run.googleapis.com

# Enable Firestore (database)
gcloud services enable firestore.googleapis.com

# Enable Cloud Build (building Docker images)
gcloud services enable cloudbuild.googleapis.com

# Enable Cloud Storage (file storage)
gcloud services enable storage-api.googleapis.com

# Enable IAM (permissions)
gcloud services enable iam.googleapis.com

# Enable Artifact Registry (image storage)
gcloud services enable artifactregistry.googleapis.com
```

---

## Step 4: Create Firestore Database

### Using Console:
```
1. Go to: https://console.cloud.google.com/firestore
2. Click "CREATE DATABASE"
3. Mode: "Native mode" (recommended)
4. Location: "asia-south1" (India - closest to you)
5. Click "CREATE"
```

### Using CLI:
```bash
gcloud firestore databases create --location=asia-south1
```

---

## Step 5: Set Up Service Account

Service account is needed to deploy on Cloud Run.

### Using Console:
```
1. Go to: https://console.cloud.google.com/iam-admin/serviceaccounts
2. Click "CREATE SERVICE ACCOUNT"
3. Name: "pod-transit-deployer"
4. Click "CREATE AND CONTINUE"
5. Click "CREATE KEY" → JSON
6. Download JSON key (save safely!)
```

### Using CLI:
```bash
# Create service account
gcloud iam service-accounts create pod-transit-deployer \
  --display-name="Pod Transit Deployer"

# Give permissions
gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member=serviceAccount:pod-transit-deployer@$(gcloud config get-value project).iam.gserviceaccount.com \
  --role=roles/run.admin

# Create and download key
gcloud iam service-accounts keys create service-account-key.json \
  --iam-account=pod-transit-deployer@$(gcloud config get-value project).iam.gserviceaccount.com
```

---

## Step 6: Configure Local Environment

```bash
# Navigate to project
cd /home/iic/Desktop/GitHub/pod

# Create .env file (copy from .env.example)
cp .env.example .env

# Edit .env with your details
nano .env
# Update:
# FIREBASE_PROJECT_ID=your-project-id
# GOOGLE_CLOUD_PROJECT=your-project-id

# Set service account
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

---

## Step 7: Deploy Backend API to Cloud Run

### Best Way: Deploy from Source

```bash
# Authenticate with gcloud
gcloud auth login

# Deploy to Cloud Run
gcloud run deploy pod-transit-api \
  --source=. \
  --platform=managed \
  --region=asia-south1 \
  --allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --timeout=300 \
  --max-instances=10
```

**What this does:**
- Builds Docker image automatically ✅
- Deploys to Cloud Run ✅
- Makes it publicly accessible ✅
- Sets memory & CPU limits ✅
- Sets max instances (auto-scaling) ✅

### Alternative: Using Docker Locally First

```bash
# Build locally
docker build -t pod-transit-api .

# Test locally
docker run -p 8080:8080 \
  -e NODE_ENV=production \
  -e FIREBASE_PROJECT_ID=your-project-id \
  pod-transit-api

# Access at: http://localhost:8080/health

# Push to Google Cloud Artifact Registry
gcloud auth configure-docker asia-south1-docker.pkg.dev

docker tag pod-transit-api \
  asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/docker/pod-transit-api

docker push \
  asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/docker/pod-transit-api
```

---

## Step 8: Verify Deployment

```bash
# Check service is running
gcloud run services describe pod-transit-api --region=asia-south1

# Test API endpoint
curl https://pod-transit-api-xxxxx.a.run.app/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2026-03-05T...",
#   "uptime": 123.45
# }
```

---

## Step 9: Update Frontend to Use Backend

Edit `full-integration.html` and add API endpoint:

```javascript
// Replace with your Cloud Run URL:
const API_URL = 'https://pod-transit-api-XXXXX.a.run.app';

// Use in fetch calls:
fetch(`${API_URL}/api/pods`)
  .then(res => res.json())
  .then(data => {
    console.log('Pods:', data.pods);
  });
```

---

## Step 10: Deploy Frontend to Cloud Storage

### Set up Static Website Hosting

```bash
# Create storage bucket
gsutil mb -l asia-south1 gs://pod-transit-website

# Make public
gsutil iam ch allUsers:objectViewer gs://pod-transit-website

# Upload files
gsutil -m cp full-integration.html gs://pod-transit-website/
gsutil -m cp mobile-app.html gs://pod-transit-website/
gsutil -m cp operator-dashboard.html gs://pod-transit-website/
gsutil -m cp *.js gs://pod-transit-website/

# Set index page
gsutil web set -m index.html gs://pod-transit-website

# Access at:
# https://storage.googleapis.com/pod-transit-website/full-integration.html
```

---

## Step 11: Set Up Continuous Deployment (Optional)

Create `cloudbuild.yaml`:

```yaml
steps:
  # Build
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'asia-south1-docker.pkg.dev/$PROJECT_ID/docker/pod-transit-api', '.']
  
  # Push
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'asia-south1-docker.pkg.dev/$PROJECT_ID/docker/pod-transit-api']
  
  # Deploy
  - name: 'gcr.io/cloud-builders/gke-deploy'
    env:
      - 'CLOUDSDK_COMPUTE_REGION=asia-south1'
      - 'CLOUDSDK_CONTAINER_CLUSTER=pod-transit'
    args:
      - 'run'
      - '--filename=k8s/'
      - '--image=asia-south1-docker.pkg.dev/$PROJECT_ID/docker/pod-transit-api:$COMMIT_SHA'
      - '--location=asia-south1'

images:
  - 'asia-south1-docker.pkg.dev/$PROJECT_ID/docker/pod-transit-api'
```

---

## 📊 Cost Estimation

### With your ₹27,287 credits (good for ~3-4 months):

| Service | Usage | Cost/Month |
|---------|-------|-----------|
| Cloud Run | 1M requests/mo | ₹300-500 |
| Firestore | 1M reads/mo | ₹200-400 |
| Cloud Storage | 10GB storage | ₹100-200 |
| Cloud Build | 6 deployments | ₹0 (free tier) |
| **Total** | Small-scale ops | **₹600-1100** |

**Result:** Your credits will last ~25-45 months! 🎉

---

## 🔍 Monitoring & Logs

### View Logs

```bash
# Real-time logs
gcloud run services logs pod-transit-api --limit=50 --tail

# Logs from console
# https://console.cloud.google.com/logs/query
```

### Set Up Monitoring

```bash
# Create uptime check
gcloud monitoring uptime create pod-transit-api \
  --display-name="Pod Transit API" \
  --http-check-resource-type=UPTIME_URL \
  --monitored-resource-type=uptime_url \
  --http-check-path=/health
```

---

## 🚀 Common Commands

```bash
# List running services
gcloud run services list

# View service details
gcloud run services describe pod-transit-api --region=asia-south1

# View logs
gcloud run services logs pod-transit-api --limit=100

# Update service (redeploy)
gcloud run deploy pod-transit-api --source=.

# Delete service
gcloud run services delete pod-transit-api

# Scale instances
gcloud run services update pod-transit-api --max-instances=20

# Change memory
gcloud run services update pod-transit-api --memory=1Gi
```

---

## ✅ Deployment Checklist

- [ ] Google Cloud account set up
- [ ] Project created (pod-transit)
- [ ] APIs enabled:
  - [ ] Cloud Run
  - [ ] Firestore
  - [ ] Cloud Build
  - [ ] Cloud Storage
- [ ] Firestore database created (asia-south1)
- [ ] Service account created with key
- [ ] .env file configured
- [ ] GOOGLE_APPLICATION_CREDENTIALS set
- [ ] Backend deployed to Cloud Run
- [ ] Frontend uploaded to Cloud Storage
- [ ] API_URL updated in frontend
- [ ] Both accessible and working
- [ ] Logs and monitoring set up

---

## 🎯 Next Steps

### Phase 1: Basic Deployment ✅ You are here
- Deploy backend API
- Deploy frontend
- Test connectivity

### Phase 2: Database Integration
- Initialize Firestore collections
- Load initial data (pods, networks, stations)
- Test CRUD operations

### Phase 3: Authentication
- Implement Firebase Auth
- Add JWT tokens
- Secure endpoints

### Phase 4: Real-time Features
- Cloud Firestore listeners
- WebSocket for live updates
- Pub/Sub for message queue

### Phase 5: Advanced Features
- Machine learning for prediction
- Payment processing
- Push notifications

---

## 🆘 Troubleshooting

### Issue: "Permission denied" during deployment
```bash
# Fix: Set correct project
gcloud config set project YOUR_PROJECT_ID
```

### Issue: Cloud Run deployment fails
```bash
# Check build logs
gcloud builds log <BUILD_ID>

# View detailed error
gcloud run services describe pod-transit-api --region=asia-south1
```

### Issue: Firebase connection error
```bash
# Verify credentials
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json

# Test connection
gcloud firestore databases list --project=YOUR_PROJECT_ID
```

### Issue: High costs
```bash
# Check usage
gcloud billing accounts list
gcloud billing budgets create --billing-account=YOUR_ACCOUNT_ID --display-name="Pod Transit" --budget-amount=5000

# Set up alert
gsutil notification create gs://pod-transit-website \
  --event=OBJECT_FINALIZE \
  --payload-format=json
```

---

## 📞 Support Resources

- **Google Cloud Documentation:** https://cloud.google.com/docs
- **Cloud Run Docs:** https://cloud.google.com/run/docs
- **Firestore Docs:** https://firebase.google.com/docs/firestore
- **Pricing Calculator:** https://cloud.google.com/products/calculator

---

## 🎉 You're Live!

Once deployed, your Pod Transit system is:
- ✅ Running 24/7 on Google Cloud
- ✅ Automatically scaled
- ✅ Globally accessible
- ✅ Monitored and logged
- ✅ Ready for production traffic

**Cost:** ~₹600-1100/month (covered by your credits for 25+ months!)

---

*Deployed on Google Cloud Run*  
*Region: Asia South 1 (Delhi)*  
*Estimated Uptime: 99.95%*

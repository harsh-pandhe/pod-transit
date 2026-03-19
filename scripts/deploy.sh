#!/bin/bash

# Pod Transit - Google Cloud Automated Deployment Script
# ========================================================
# One-command deployment to Google Cloud Run

set -e

echo "🚀 Pod Transit - Google Cloud Deployment"
echo "========================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"
    
    # Check gcloud
    if ! command -v gcloud &> /dev/null; then
        echo -e "${RED}❌ gcloud CLI not found. Install it first:${NC}"
        echo "https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    
    # Check if logged in
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
        echo -e "${YELLOW}⚠️ Not logged in to gcloud. Running login...${NC}"
        gcloud auth login
    fi
    
    echo -e "${GREEN}✓ Prerequisites OK${NC}"
    echo ""
}

# Set project
setup_project() {
    echo -e "${BLUE}Setting up project...${NC}"
    
    # Get current project or create new
    PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "")
    
    if [ -z "$PROJECT_ID" ]; then
        echo "Enter your GCP Project ID (or press Enter to create new):"
        read -r PROJECT_ID
        
        if [ -z "$PROJECT_ID" ]; then
            PROJECT_ID="pod-transit-$(date +%s)"
        fi
        
        echo -e "${YELLOW}Creating project: $PROJECT_ID${NC}"
        gcloud projects create $PROJECT_ID --name="Pod Transit System"
    fi
    
    gcloud config set project $PROJECT_ID
    echo -e "${GREEN}✓ Project: $PROJECT_ID${NC}"
    echo ""
}

# Enable APIs
enable_apis() {
    echo -e "${BLUE}Enabling required APIs...${NC}"
    
    apis=(
        "run.googleapis.com"
        "firestore.googleapis.com"
        "cloudbuild.googleapis.com"
        "storage-api.googleapis.com"
        "iam.googleapis.com"
        "artifactregistry.googleapis.com"
    )
    
    for api in "${apis[@]}"; do
        echo -n "  Enabling $api... "
        gcloud services enable $api --quiet || true
        echo -e "${GREEN}✓${NC}"
    done
    
    echo ""
}

# Create Firestore database
setup_firestore() {
    echo -e "${BLUE}Setting up Firestore database...${NC}"
    
    # Check if database exists
    if gcloud firestore databases list --format="value(name)" | grep -q .; then
        echo -e "${YELLOW}⚠️ Firestore database already exists${NC}"
    else
        echo "Creating Firestore database..."
        gcloud firestore databases create --location=asia-south1 --quiet || true
    fi
    
    echo -e "${GREEN}✓ Firestore ready${NC}"
    echo ""
}

# Create service account
setup_service_account() {
    echo -e "${BLUE}Setting up Service Account...${NC}"
    
    SA_NAME="pod-transit-deployer"
    SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
    
    # Check if service account exists
    if gcloud iam service-accounts describe $SA_EMAIL --project=$PROJECT_ID &>/dev/null; then
        echo -e "${YELLOW}⚠️ Service account already exists${NC}"
    else
        echo "Creating service account..."
        gcloud iam service-accounts create $SA_NAME \
            --display-name="Pod Transit Deployer" \
            --project=$PROJECT_ID
        
        # Grant permissions
        gcloud projects add-iam-policy-binding $PROJECT_ID \
            --member="serviceAccount:$SA_EMAIL" \
            --role="roles/run.admin" \
            --quiet
        
        gcloud projects add-iam-policy-binding $PROJECT_ID \
            --member="serviceAccount:$SA_EMAIL" \
            --role="roles/cloudbuild.builds.editor" \
            --quiet
    fi
    
    echo -e "${GREEN}✓ Service account: $SA_EMAIL${NC}"
    echo ""
}

# Deploy to Cloud Run
deploy_api() {
    echo -e "${BLUE}Deploying backend API to Cloud Run...${NC}"
    
    # Check if .env exists
    if [ ! -f ".env" ]; then
        echo "Creating .env file..."
        cp .env.example .env
        echo -e "${YELLOW}⚠️ Please edit .env with your Firebase credentials${NC}"
        read -p "Press Enter to continue..."
    fi
    
    echo "Deploying application..."
    
    SERVICE_NAME="pod-transit-api"
    
    gcloud run deploy $SERVICE_NAME \
        --source=. \
        --platform=managed \
        --region=asia-south1 \
        --allow-unauthenticated \
        --memory=512Mi \
        --cpu=1 \
        --timeout=300 \
        --max-instances=10 \
        --quiet
    
    # Get service URL
    SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=asia-south1 --format='value(status.url)')
    
    echo -e "${GREEN}✓ API deployed: $SERVICE_URL${NC}"
    echo ""
    
    # Test API
    echo "Testing API..."
    if curl -s "$SERVICE_URL/health" | grep -q "healthy"; then
        echo -e "${GREEN}✓ API is healthy${NC}"
    else
        echo -e "${YELLOW}⚠️ Could not verify API health${NC}"
    fi
    echo ""
}

# Create Cloud Storage bucket
setup_storage() {
    echo -e "${BLUE}Setting up Cloud Storage for frontend...${NC}"
    
    BUCKET="gs://pod-transit-${PROJECT_ID}"
    
    # Check if bucket exists
    if gsutil ls $BUCKET &>/dev/null; then
        echo -e "${YELLOW}⚠️ Bucket already exists${NC}"
    else
        echo "Creating storage bucket..."
        gsutil mb -l asia-south1 $BUCKET
        
        # Make public
        gsutil iam ch allUsers:objectViewer $BUCKET
        
        # Enable website hosting
        gsutil web set -m index.html -e index.html $BUCKET
    fi
    
    echo -e "${GREEN}✓ Storage bucket: $BUCKET${NC}"
    echo ""
}

# Deploy frontend
deploy_frontend() {
    echo -e "${BLUE}Deploying frontend to Cloud Storage...${NC}"
    
    BUCKET="gs://pod-transit-${PROJECT_ID}"
    
    # Upload HTML files
    echo "Uploading frontend files..."
    
    gsutil -m cp full-integration.html $BUCKET/
    gsutil -m cp mobile-app.html $BUCKET/
    gsutil -m cp operator-dashboard.html $BUCKET/
    gsutil -m cp intelligent-simulation.html $BUCKET/
    gsutil -m cp index-hub.html $BUCKET/
    gsutil -m cp *.js $BUCKET/ || true
    
    echo -e "${GREEN}✓ Frontend deployed${NC}"
    
    # Get bucket URL
    BUCKET_URL="https://storage.googleapis.com/pod-transit-${PROJECT_ID}"
    echo -e "${BLUE}Frontend URL: ${BUCKET_URL}/full-integration.html${NC}"
    echo ""
}

# Summary
show_summary() {
    echo -e "${GREEN}════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ Deployment Complete!${NC}"
    echo -e "${GREEN}════════════════════════════════════════${NC}"
    echo ""
    echo -e "${BLUE}Your Pod Transit System is now live:${NC}"
    echo ""
    echo -e "${YELLOW}API Endpoint:${NC}"
    echo "  $SERVICE_URL"
    echo ""
    echo -e "${YELLOW}Frontend:${NC}"
    echo "  $BUCKET_URL/full-integration.html"
    echo ""
    echo -e "${YELLOW}Project ID:${NC}"
    echo "  $PROJECT_ID"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "  1. Update full-integration.html with API endpoint"
    echo "  2. Configure Firebase authentication"
    echo "  3. Set up payment processing"
    echo "  4. Monitor usage and costs"
    echo ""
    echo -e "${BLUE}Useful commands:${NC}"
    echo "  View logs:      gcloud run logs read pod-transit-api --region asia-south1"
    echo "  Update service: gcloud run deploy pod-transit-api --source ."
    echo "  View usage:     gcloud billing budgets list"
    echo ""
}

# Main execution
echo ""
echo -e "${BLUE}Starting deployment...${NC}"
echo ""

check_prerequisites
setup_project
enable_apis
setup_firestore
setup_service_account
deploy_api
setup_storage
deploy_frontend
show_summary

echo -e "${GREEN}🎉 All done! Your Pod Transit system is live.${NC}"
echo ""

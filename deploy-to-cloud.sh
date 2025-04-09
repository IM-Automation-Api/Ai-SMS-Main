#!/bin/bash

# Set the project ID
PROJECT_ID="tactile-sentry-452823-f7"

# Submit build to Google Cloud Build
echo "Submitting build to Google Cloud Build for project: $PROJECT_ID"
gcloud builds submit --project=$PROJECT_ID --config=cloudbuild.yaml

echo "Build submitted. Check the Google Cloud Build console for build status."
echo "After deployment, your service will be available at: https://javascript-node-730199417968.us-central1.run.app"

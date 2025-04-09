# Google Cloud Run Trigger Setup Guide

This guide provides step-by-step instructions for setting up a Cloud Run trigger for this project.

## Prerequisites

- Google Cloud account with billing enabled
- GitHub repository connected to Google Cloud Build
- Necessary permissions to create triggers and deploy to Cloud Run

## Setup Instructions

### 1. Navigate to Cloud Build Triggers

1. Go to the Google Cloud Console: https://console.cloud.google.com/
2. Select your project: `tactile-sentry-452823-f7`
3. Navigate to Cloud Build > Triggers

### 2. Create a New Trigger

Click "Create Trigger" and configure the following settings:

#### Name and Region
- **Name**: `javascript-node-trigger` (or any descriptive name)
- **Region**: `global`

#### Event
- **Event**: `Push to a branch`
- **Repository**: `mlynnf123/javascript-node (GitHub App)`
- **Branch**: `^main$` (or your preferred branch pattern)

#### Configuration
- **Configuration type**: `Dockerfile`
- **Location**: `Repository`
- **Dockerfile directory**: `/` (the root directory)
- **Dockerfile name**: `Dockerfile`
- **Image name**: `gcr.io/tactile-sentry-452823-f7/github.com/mlynnf123/javascript-node:$COMMIT_SHA`

### 3. Set Up Substitution Variables

Add the following substitution variables (click "Add variable" for each):

- `_TWILIO_SID`: Your Twilio SID
- `_TWILIO_AUTH_TOKEN`: Your Twilio Auth Token
- `_TWILIO_PHONE`: Your Twilio Phone Number
- `_SUPABASE_URL`: Your Supabase URL
- `_SUPABASE_KEY`: Your Supabase Key
- `_OPENAI_API_KEY`: Your OpenAI API Key
- `_OPENAI_ASSISTANT_ID`: Your OpenAI Assistant ID
- `_N8N_CHAT_WEBHOOK`: Your N8N Chat Webhook URL

**IMPORTANT**: All of these environment variables are required for the application to function properly. The build will fail if any of these variables are not set. Make sure to copy the values exactly from your .env file.

#### How to Find These Values

- **Twilio Credentials**: Log in to your Twilio account dashboard at https://www.twilio.com/console
- **Supabase Credentials**: 
  - Go to your Supabase project dashboard
  - Click on "Settings" in the left sidebar
  - Click on "API" to find your URL and API keys
- **OpenAI API Key**: Found in your OpenAI dashboard under API keys
- **OpenAI Assistant ID**: The ID of your OpenAI Assistant (starts with "asst_")
- **N8N Chat Webhook**: The webhook URL from your N8N workflow

### 4. Advanced Options (Optional)

- **Timeout**: `1200s` (20 minutes, adjust as needed)
- **Service account**: Use the default service account or select a specific one
- **Logs**: Enable Cloud Logging if desired

### 5. Create the Trigger

Click "Create" to save your trigger configuration.

## Testing the Trigger

To test the trigger:

1. Make a change to your repository and push it to the configured branch
2. Go to Cloud Build > History to monitor the build progress
3. Once the build completes, go to Cloud Run to see your deployed service

## Troubleshooting

If you encounter errors:

1. Check the build logs in Cloud Build > History
2. Verify that all substitution variables are correctly set
3. Ensure the service account has the necessary permissions
4. Confirm that the Dockerfile is correctly formatted and builds successfully

## Accessing Your Deployed Service

After successful deployment, your service will be available at:
```
https://javascript-node-730199417968.us-central1.run.app
```

The Twilio webhook endpoint will be:
```
https://javascript-node-730199417968.us-central1.run.app/sms

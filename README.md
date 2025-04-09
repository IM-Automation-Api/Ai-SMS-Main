# SMS AI Assistant

A Node.js application that integrates Twilio SMS, Supabase, and OpenAI to create an AI-powered SMS chatbot.

## Overview

This application:
- Receives SMS messages via a Twilio webhook
- Stores conversation history in a Supabase database
- Processes messages using OpenAI's API
- Sends AI-generated responses back to users via SMS

## Prerequisites

- Node.js (v14 or higher)
- Twilio account with a phone number
- Supabase account with a project set up
- OpenAI API key
- N8N instance for workflow automation (optional)

## Environment Variables

Create a `.env` file with the following variables:

```
# Twilio Credentials
TWILIO_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE=your_twilio_phone_number

# Supabase Credentials
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key

# OpenAI Assistant ID
OPENAI_ASSISTANT_ID=your_openai_assistant_id

# Webhook URL
N8N_CHAT_WEBHOOK=your_n8n_webhook_url

# Server Port (optional)
PORT=3000
```

## Database Setup

The application requires a Supabase database with the following tables:
- `leads`: Stores user information and OpenAI thread IDs
- `conversations`: Stores the message history
- `prompts`: Optional table for system prompts

Run the SQL commands in `supabase_schema.sql` to set up your database.

## Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```

## Running the Application

Start the server:

```
npm start
```

The server will run on port 3000 by default (or the port specified in your `.env` file).

## Webhook Setup

Configure your Twilio phone number to send incoming SMS messages to:
```
https://your-server-url/sms
```

You may need to use a service like ngrok to expose your local server to the internet during development.

## License

ISC

## Docker Deployment

This project includes Docker configuration for containerized deployment using multi-stage builds:

### Multi-Stage Dockerfile

The Dockerfile uses a three-stage build process for optimal efficiency:

1. **Dependencies Stage**: Installs production dependencies only
2. **Build Stage**: Compiles the application (if needed)
3. **Runtime Stage**: Creates a minimal production image

This approach results in smaller, more secure Docker images by:
- Separating build-time and runtime dependencies
- Including only necessary files in the final image
- Using Alpine Linux for a smaller footprint

### Local Docker Build and Run

```bash
# Build the Docker image
docker build -t gcr.io/tactile-sentry-452823-f7/github.com/mlynnf123/javascript-node:local .

# Run the container
docker run -p 3000:3000 --env-file .env gcr.io/tactile-sentry-452823-f7/github.com/mlynnf123/javascript-node:local
```

### Google Cloud Build Deployment

This project is configured for deployment to Google Cloud Run using Google Cloud Build:

1. Set up a Google Cloud project and enable the necessary APIs:
   - Cloud Build API
   - Container Registry API
   - Cloud Run API

2. Create a Cloud Build trigger in the Google Cloud Console:
   - See the detailed setup guide in [CLOUD_RUN_SETUP.md](CLOUD_RUN_SETUP.md)
   - The trigger uses the repository: `mlynnf123/javascript-node`
   - Image name: `gcr.io/tactile-sentry-452823-f7/github.com/mlynnf123/javascript-node:$COMMIT_SHA`

3. Push your code to trigger a build and deployment:
   ```bash
   git push origin main
   ```

4. After deployment, update your Twilio webhook URL to point to your Cloud Run service URL:
   ```
   https://javascript-node-730199417968.us-central1.run.app/sms
   ```

### Deployment Scripts

This project includes helper scripts for Docker and Google Cloud deployment:

#### Local Docker Testing

```bash
# Make the script executable (if needed)
chmod +x docker-local.sh

# Run the script
./docker-local.sh
```

This script builds the Docker image and runs it locally, exposing port 3000.

#### Google Cloud Build Deployment

```bash
# Make the script executable (if needed)
chmod +x deploy-to-cloud.sh

# Run the script
./deploy-to-cloud.sh
```

This script submits a build to Google Cloud Build using the preconfigured project ID (`tactile-sentry-452823-f7`) and the cloudbuild.yaml configuration.

## Cloud Run Setup

For detailed instructions on setting up the Cloud Run trigger, see the [Cloud Run Setup Guide](CLOUD_RUN_SETUP.md).

#!/bin/bash

# Build the Docker image
echo "Building Docker image..."
docker build -t gcr.io/tactile-sentry-452823-f7/github.com/mlynnf123/javascript-node:local .

# Run the container
echo "Running container..."
docker run -p 3000:3000 --env-file .env gcr.io/tactile-sentry-452823-f7/github.com/mlynnf123/javascript-node:local

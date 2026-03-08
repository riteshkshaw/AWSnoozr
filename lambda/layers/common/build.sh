#!/bin/bash

# Build script for Lambda layer
# This script installs dependencies and creates a zip file for deployment

set -e

echo "Installing dependencies..."
cd nodejs
npm install --production

echo "Creating layer zip..."
cd ..
zip -r layer.zip nodejs/ -x "*.git*" "*.DS_Store"

echo "Layer build complete: layer.zip"

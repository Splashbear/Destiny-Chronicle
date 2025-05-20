#!/bin/bash

# Check if API key is provided
if [ -z "$1" ]; then
    echo "Please provide your Bungie API key as an argument"
    echo "Usage: ./update-d1-activities.sh YOUR_API_KEY"
    exit 1
fi

# Export the API key
export BUNGIE_API_KEY=$1

# Run the Node.js script
node scripts/fetch-missing-activities.js 
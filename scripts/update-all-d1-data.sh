#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if API key is provided
if [ -z "$1" ]; then
    echo -e "${RED}Please provide your Bungie API key as an argument${NC}"
    echo "Usage: ./update-all-d1-data.sh YOUR_API_KEY"
    exit 1
fi

# Export the API key
export BUNGIE_API_KEY=$1

echo -e "${YELLOW}Starting D1 data update process...${NC}"

# Step 1: Create directories
echo -e "\n${YELLOW}Step 1: Setting up directories...${NC}"
mkdir -p src/assets/data
mkdir -p scripts/logs

# Step 2: Extract logs from console
echo -e "\n${YELLOW}Step 2: Extracting logs...${NC}"
echo -e "${BLUE}Please paste your console logs (press Ctrl+D when done):${NC}"
echo -e "${BLUE}Note: Only paste the lines containing 'referenceId' or 'MISSING'${NC}"
cat > scripts/logs/missing-activity-logs.txt

# Count lines in the log file
LINE_COUNT=$(wc -l < scripts/logs/missing-activity-logs.txt)
echo -e "\n${GREEN}Logs saved (${LINE_COUNT} lines). Processing...${NC}"

# Step 3: Run the activity fetch script
echo -e "\n${YELLOW}Step 3: Fetching missing activity data...${NC}"
echo -e "${BLUE}This may take a few minutes. Please wait...${NC}"
node scripts/fetch-missing-activities.js

# Step 4: Check if the output file was created
if [ -f "src/assets/data/d1-missing-activities.json" ]; then
    echo -e "\n${GREEN}Successfully created d1-missing-activities.json${NC}"
    
    # Count the number of activities found
    ACTIVITY_COUNT=$(node -e "console.log(require('./src/assets/data/d1-missing-activities.json').activities.length)")
    echo -e "${GREEN}Found ${ACTIVITY_COUNT} missing activities${NC}"
else
    echo -e "\n${RED}Failed to create d1-missing-activities.json${NC}"
    exit 1
fi

# Step 5: Update the manifest
echo -e "\n${YELLOW}Step 5: Updating manifest...${NC}"
echo -e "${BLUE}Updating manifest with new activity data...${NC}"
node scripts/update-d1-manifest.js

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}D1 data update process completed!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${BLUE}You can now restart your application to see the updated activity data.${NC}"
echo -e "${BLUE}Press any key to exit...${NC}"
read -n 1 
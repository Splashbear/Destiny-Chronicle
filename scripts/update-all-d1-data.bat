@echo off
setlocal enabledelayedexpansion

:: Check if API key is provided
if "%~1"=="" (
    echo Please provide your Bungie API key as an argument
    echo Usage: update-all-d1-data.bat YOUR_API_KEY
    exit /b 1
)

:: Set the API key
set BUNGIE_API_KEY=%~1

echo Starting D1 data update process...

:: Step 1: Create directories
echo.
echo Step 1: Setting up directories...
if not exist "src\assets\data" mkdir "src\assets\data"
if not exist "scripts\logs" mkdir "scripts\logs"

:: Step 2: Extract logs from console
echo.
echo Step 2: Extracting logs...
echo Please paste your console logs (press Ctrl+Z and Enter when done):
type con > "scripts\logs\missing-activity-logs.txt"

:: Step 3: Run the activity fetch script
echo.
echo Step 3: Fetching missing activity data...
node scripts\fetch-missing-activities.js

:: Step 4: Check if the output file was created
if exist "src\assets\data\d1-missing-activities.json" (
    echo Successfully created d1-missing-activities.json
    
    :: Count the number of activities found
    for /f "tokens=*" %%a in ('node -e "console.log(require('./src/assets/data/d1-missing-activities.json').activities.length)"') do (
        set ACTIVITY_COUNT=%%a
    )
    echo Found !ACTIVITY_COUNT! missing activities
) else (
    echo Failed to create d1-missing-activities.json
    exit /b 1
)

:: Step 5: Update the manifest
echo.
echo Step 5: Updating manifest...
node scripts\update-d1-manifest.js

echo.
echo D1 data update process completed!
echo You can now restart your application to see the updated activity data. 
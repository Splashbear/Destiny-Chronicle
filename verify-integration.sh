#!/bin/bash

echo "======================================"
echo "Archive API Integration Verification"
echo "======================================"
echo ""

# Check if archive API is running
echo "1. Checking Archive API (port 3001)..."
if curl -s http://localhost:3001/players/4611686018465122437/activities > /dev/null 2>&1; then
    echo "   ✅ Archive API is running"
    COVERAGE=$(curl -s http://localhost:3001/players/4611686018465122437/activities | grep -o '"rowCount":[0-9]*' | cut -d':' -f2)
    echo "   ℹ️  Mock data: $COVERAGE activities for test account"
else
    echo "   ❌ Archive API not responding"
    echo "   Run: node test-archive-api.js"
fi
echo ""

# Check if Angular dev server is running
echo "2. Checking Angular Dev Server (port 4200)..."
if curl -s http://localhost:4200 > /dev/null 2>&1; then
    echo "   ✅ Angular dev server is running"
else
    echo "   ❌ Angular dev server not responding"
    echo "   Run: npm start"
fi
echo ""

# Check environment configuration
echo "3. Checking Environment Configuration..."
if grep -q "useArchiveActivities: true" src/environments/environment.ts; then
    echo "   ✅ useArchiveActivities is enabled"
else
    echo "   ❌ useArchiveActivities is disabled"
    echo "   Edit: src/environments/environment.ts"
fi

if grep -q "useExternalPgcr: true" src/environments/environment.ts; then
    echo "   ✅ useExternalPgcr is enabled"
else
    echo "   ❌ useExternalPgcr is disabled"
    echo "   Edit: src/environments/environment.ts"
fi

if grep -q "pgcrApiRoot: 'http://localhost:3001'" src/environments/environment.ts; then
    echo "   ✅ pgcrApiRoot points to localhost:3001"
else
    echo "   ⚠️  pgcrApiRoot may not be configured correctly"
fi
echo ""

# Check if code changes are present
echo "4. Checking Code Integration..."
if grep -q "fetchPlayerActivities" src/app/services/pgcr-api.service.ts; then
    echo "   ✅ Archive API methods added to PgcrApiService"
else
    echo "   ❌ Archive API methods not found"
fi

if grep -q "convertLightActivityToHistory" src/app/components/player-search/player-search.component.ts; then
    echo "   ✅ Light activity converter added to PlayerSearchComponent"
else
    echo "   ❌ Light activity converter not found"
fi
echo ""

echo "======================================"
echo "Next Steps:"
echo "======================================"
echo "1. Ensure both servers are running (archive API + Angular)"
echo "2. Open browser to http://localhost:4200"
echo "3. Open DevTools Console (F12)"
echo "4. Search for membership ID: 4611686018465122437"
echo "5. Look for [Archive] log messages in console"
echo ""
echo "Expected: Activities load in 2-5 seconds from archive"
echo ""

import { Handler } from '@netlify/functions';

// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400', // 24 hours
};

// Cache configuration
const CACHE_TTL = {
  activities: 300, // 5 minutes
  manifest: 3600, // 1 hour
  characters: 1800, // 30 minutes
  default: 600 // 10 minutes
};

// Simple in-memory cache (for serverless, consider Redis for production)
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

export const handler: Handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    const { path, query } = event;
    const apiKey = event.headers['x-api-key'] || process.env.BUNGIE_API_KEY;
    
    if (!apiKey) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'API key required' })
      };
    }

    // Build Bungie API URL
    const bungieUrl = `https://www.bungie.net${path}${query ? '?' + query : ''}`;
    
    // Check cache first
    const cacheKey = `${path}${query}`;
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < cached.ttl * 1000) {
      console.log(`[Cache Hit] ${cacheKey}`);
      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Cache': 'HIT'
        },
        body: JSON.stringify(cached.data)
      };
    }

    // Make request to Bungie API
    console.log(`[API Call] ${bungieUrl}`);
    const response = await fetch(bungieUrl, {
      method: event.httpMethod,
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'DestinyChronicle/1.0'
      }
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: `Bungie API error: ${response.status} ${response.statusText}` 
        })
      };
    }

    const data = await response.json();
    
    // Determine cache TTL based on endpoint
    let ttl = CACHE_TTL.default;
    if (path.includes('/Manifest/')) {
      ttl = CACHE_TTL.manifest;
    } else if (path.includes('/ActivityHistory/')) {
      ttl = CACHE_TTL.activities;
    } else if (path.includes('/Characters/')) {
      ttl = CACHE_TTL.characters;
    }

    // Cache the response
    cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      ttl
    });

    // Clean up old cache entries (simple cleanup)
    if (cache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > value.ttl * 1000) {
          cache.delete(key);
        }
      }
    }

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'X-Cache': 'MISS'
      },
      body: JSON.stringify(data)
    };

  } catch (error) {
    console.error('Proxy error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

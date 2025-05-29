const https = require('https');

const API_KEY = process.env.BUNGIE_API_KEY;
if (!API_KEY) {
  console.error('Error: BUNGIE_API_KEY environment variable is not set');
  process.exit(1);
}

const DISPLAY_NAME = 'splashbear';
const DISPLAY_NAME_CODE = '1078';

// First, search for the player
const searchUrl = `https://www.bungie.net/Platform/Destiny2/SearchDestinyPlayer/-1/${encodeURIComponent(DISPLAY_NAME + '#' + DISPLAY_NAME_CODE)}/`;
console.log('Searching for player with URL:', searchUrl);

https.get(searchUrl, {
  headers: {
    'X-API-Key': API_KEY,
    'User-Agent': 'DestinyChronicle/1.0',
    'Accept': 'application/json'
  }
}, (res) => {
  console.log('Search response status:', res.statusCode);
  console.log('Search response headers:', res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      console.log('Raw search response:', data);
      const searchResult = JSON.parse(data);
      console.log('Parsed search response:', JSON.stringify(searchResult, null, 2));
      
      if (searchResult.Response && searchResult.Response.length > 0) {
        const player = searchResult.Response[0];
        console.log('Found player:', player);
        
        // Now get their titles
        const titlesUrl = `https://www.bungie.net/Platform/Destiny2/${player.membershipType}/Profile/${player.membershipId}/?components=900`;
        console.log('Fetching titles with URL:', titlesUrl);
        
        https.get(titlesUrl, {
          headers: {
            'X-API-Key': API_KEY,
            'User-Agent': 'DestinyChronicle/1.0',
            'Accept': 'application/json'
          }
        }, (titlesRes) => {
          console.log('Titles response status:', titlesRes.statusCode);
          console.log('Titles response headers:', titlesRes.headers);
          
          let titlesData = '';
          titlesRes.on('data', (chunk) => {
            titlesData += chunk;
          });
          titlesRes.on('end', () => {
            try {
              console.log('Raw titles response:', titlesData);
              const titlesResult = JSON.parse(titlesData);
              console.log('Parsed titles response:', JSON.stringify(titlesResult, null, 2));
            } catch (err) {
              console.error('Error parsing titles response:', err);
            }
          });
        }).on('error', (err) => {
          console.error('Error fetching titles:', err);
        });
      } else {
        console.log('Player not found in response');
      }
    } catch (err) {
      console.error('Error parsing search response:', err);
    }
  });
}).on('error', (err) => {
  console.error('Error searching player:', err);
}); 
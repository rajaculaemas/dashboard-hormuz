#!/usr/bin/env node

const http = require('http');

async function testAPI() {
  console.log('Testing /api/cases endpoint...');
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/cases?limit=2&integrationId=1',
      method: 'GET',
      headers: {
        'User-Agent': 'Test Script'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          console.log('\\n=== API RESPONSE STRUCTURE ===');
          console.log(`Status: ${res.statusCode}`);
          console.log(`Response keys: ${Object.keys(parsed).join(', ')}`);
          
          if (parsed.data && Array.isArray(parsed.data)) {
            console.log(`\\nFound ${parsed.data.length} cases in response`);
            
            if (parsed.data.length > 0) {
              const firstCase = parsed.data[0];
              console.log(`\\nFirst case structure:`);
              console.log(`  Keys: ${Object.keys(firstCase).join(', ')}`);
              console.log(`  ID: ${firstCase.id}`);
              console.log(`  Name: ${firstCase.name}`);
              console.log(`  Has metadata: ${!!firstCase.metadata}`);
              
              if (firstCase.metadata) {
                console.log(`  Metadata keys: ${Object.keys(firstCase.metadata).join(', ')}`);
                console.log(`  Has case_history: ${!!firstCase.metadata.case_history}`);
                if (firstCase.metadata.case_history) {
                  console.log(`  case_history items: ${firstCase.metadata.case_history.length}`);
                }
              }
              
              // Look for case 77
              const case77 = parsed.data.find(c => c.id === '77' || c.externalId === '77' || c.ticketId === 77);
              if (case77) {
                console.log(`\\n=== CASE 77 FOUND ===`);
                console.log(`ID: ${case77.id}`);
                console.log(`Metadata: ${JSON.stringify(case77.metadata, null, 2).substring(0, 500)}`);
              } else {
                console.log(`\\nCase 77 not found. Available IDs: ${parsed.data.slice(0, 5).map(c => c.id).join(', ')}`);
              }
            }
          } else {
            console.log('Response has no data array');
          }
          
          resolve();
        } catch (err) {
          console.error('Failed to parse response:', err);
          console.log('Raw response:', data.substring(0, 500));
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      console.error('Request error:', err);
      reject(err);
    });

    req.end();
  });
}

testAPI().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

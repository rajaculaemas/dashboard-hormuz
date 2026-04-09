const http = require('http');

// Call the API endpoint directly
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/cases?integrationId=b4e9da50-3e74-499e-9d36-e9a24bf1b0e2',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
  },
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      
      console.log('\n=== API RESPONSE ===');
      console.log(`Status: ${res.statusCode}`);
      console.log(`Success: ${response.success}`);
      console.log(`Cases count: ${response.data?.length || 0}`);
      
      if (response.data && response.data.length > 0) {
        // Find case 77
        const case77 = response.data.find(c => c.id === '77' || c.externalId === '77' || c.ticketId === 77);
        
        if (case77) {
          console.log('\n=== CASE 77 DATA ===');
          console.log(`ID: ${case77.id}`);
          console.log(`Name: ${case77.name}`);
          console.log(`Status: ${case77.status}`);
          console.log(`Metadata exists: ${!!case77.metadata}`);
          console.log(`Metadata keys: ${case77.metadata ? Object.keys(case77.metadata).join(', ') : 'N/A'}`);
          
          if (case77.metadata?.case_history) {
            console.log(`\nCASE HISTORY FOUND!`);
            console.log(`case_history count: ${case77.metadata.case_history.length}`);
            console.log(`case_history entries:`);
            case77.metadata.case_history.forEach((entry, idx) => {
              console.log(`  [${idx}] ${entry.change_type}: ${entry.field_name} (${entry.old_value} → ${entry.new_value})`);
            });
          } else {
            console.log(`\n❌ case_history NOT FOUND in metadata!`);
            console.log(`Full metadata:`, JSON.stringify(case77.metadata, null, 2).substring(0, 500));
          }
          
          console.log(`\nAlerts count: ${case77.alerts?.length || 0}`);
        } else {
          console.log('\n❌ Case 77 NOT FOUND');
          console.log(`Available cases: ${response.data.map(c => `${c.id}-${c.name?.substring(0, 20)}`).join(', ')}`);
        }
      }
    } catch (error) {
      console.error('Parse error:', error.message);
      console.error('Raw response:', data.substring(0, 500));
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();

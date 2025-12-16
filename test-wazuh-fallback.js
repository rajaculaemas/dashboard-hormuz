const { WazuhClient } = require('./lib/api/wazuh-client.ts');

async function test() {
  const client = new WazuhClient({
    elasticsearch_url: process.env.ELASTICSEARCH_URL || 'https://localhost:9200',
    elasticsearch_index: process.env.ELASTICSEARCH_INDEX || 'wazuh-posindonesia_*',
    elasticsearch_username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
    elasticsearch_password: process.env.ELASTICSEARCH_PASSWORD || 'changeme',
  });

  try {
    console.log('Testing Wazuh alert fetch with fallback...');
    const alerts = await client.getAlerts(2); // 2 hour window
    console.log(`✅ Successfully fetched ${alerts.length} alerts`);
    
    if (alerts.length > 0) {
      console.log('\nFirst alert:');
      console.log(JSON.stringify(alerts[0], null, 2));
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

test();

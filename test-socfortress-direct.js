#!/usr/bin/env node

/*
 * Direct test of getSocfortressCases function
 * Run with: node test-socfortress-direct.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

async function runTest() {
  try {
    // Import the function
    const { getSocfortressCases } = await import('./lib/api/socfortress.ts');
    
    console.log('Testing getSocfortressCases directly...\n');
    
    // Get integrations to find SOCFortress
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const integration = await prisma.integration.findFirst({
      where: {
        source: 'socfortress'
      }
    });
    
    if (!integration) {
      console.error('No SOCFortress integration found');
      process.exit(1);
    }
    
    console.log(`Found SOCFortress integration: ${integration.name} (ID: ${integration.id})\n`);
    
    // Call the function
    const result = await getSocfortressCases(integration.id, { limit: 2 });
    
    console.log('=== FUNCTION RETURN VALUE ===');
    console.log(`Total cases: ${result.count}`);
    console.log(`Cases array length: ${result.cases.length}\n`);
    
    if (result.cases.length > 0) {
      const firstCase = result.cases[0];
      console.log('=== FIRST CASE STRUCTURE ===');
      console.log(`Keys: ${Object.keys(firstCase).join(', ')}\n`);
      
      console.log(`Field values:`);
      console.log(`  externalId: ${firstCase.externalId}`);
      console.log(`  name: ${firstCase.name}`);
      console.log(`  timestamp: ${firstCase.timestamp}`);
      console.log(`  integrationId: ${firstCase.integrationId}`);
      console.log(`  alerts array length: ${Array.isArray(firstCase.alerts) ? firstCase.alerts.length : 'N/A'}`);
      console.log(`  metadata exists: ${!!firstCase.metadata}`);
      
      if (firstCase.metadata) {
        console.log(`\\n  Metadata keys: ${Object.keys(firstCase.metadata).join(', ')}`);
        if (firstCase.metadata.case_history) {
          console.log(`  case_history array length: ${firstCase.metadata.case_history.length}`);
          if (firstCase.metadata.case_history.length > 0) {
            console.log(`  First history entry:`, JSON.stringify(firstCase.metadata.case_history[0], null, 2).substring(0, 300));
          }
        }
      }
      
      // Look for case 77
      const case77 = result.cases.find(c => c.externalId === '77');
      if (case77) {
        console.log(`\\n=== CASE 77 DETAILS ===`);
        console.log(`Name: ${case77.name}`);
        console.log(`Metadata structure:`);
        console.log(JSON.stringify(case77.metadata, null, 2).substring(0, 500));
      }
    }
    
    await prisma.$disconnect();
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

runTest();

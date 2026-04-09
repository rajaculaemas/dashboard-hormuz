#!/usr/bin/env node

/**
 * Test script to check case metadata flow
 * Runs API call to see actual response structure
 */

const fs = require('fs')
const path = require('path');

async function testCaseMetadata() {
  try {
    console.log('\n=== Testing Case Metadata Flow ===\n')
    
    // Read case 77 test data
    const caseJson = fs.readFileSync('/home/soc/soc-dashboard/case77.json', 'utf8')
    const caseData = JSON.parse(caseJson)
    
    console.log('1. Test Data Structure (from case77.json):')
    console.log('   - Cases count:', caseData.cases.length)
    console.log('   - Case 77 has case_history:', caseData.cases[0].case_history?.length || 0, 'entries')
    
    if (caseData.cases[0].case_history?.length > 0) {
      console.log('   - First history entry:', {
        id: caseData.cases[0].case_history[0].id,
        change_type: caseData.cases[0].case_history[0].change_type,
        changed_at: caseData.cases[0].case_history[0].changed_at,
      })
    }
    
    console.log('\n2. Expected metadata structure in API response should be:')
    console.log('   {')
    console.log('     socfortress: { ... },')
    console.log('     case_history: [ ...entries... ]')
    console.log('   }')
    
    console.log('\n3. Checking transformation flow in lib/api/socfortress.ts:')
    console.log('   - getSocfortressCases() includes: metadata.socfortress + metadata.case_history')
    console.log('   - Returns object with: externalId, name, status, metadata, alerts')
    
    console.log('\n4. Checking API transformation in app/api/cases/route.ts:')
    console.log('   - Maps SOCFortress case to: ...caseItem (spread operator)')
    console.log('   - Should preserve metadata field from spread')
    console.log('   - Also adds: alerts, mttd')
    
    console.log('\n5. What Frontend SLA Page Does:')
    console.log('   - Fetches /api/cases')
    console.log('   - Parses: dataCases.data || dataCases.cases')
    console.log('   - Logs: casesData[0].metadata')
    console.log('   - Passes to component: item: c (where c is full case object)')
    
    console.log('\n6. What Component Receives:')
    console.log('   - case={selectedCase} where selectedCase = row.item')
    console.log('   - Component tries: caseDetail?.metadata?.case_history')
    console.log('   - Currently shows: undefined')
    
    console.log('\n=== Analysis ===')
    console.log('If metadata is present at API layer but undefined at component,')
    console.log('the problem is likely:')
    console.log('1. API response structure - metadata not at top level?')
    console.log('2. Data loss during state update (setCases)?')
    console.log('3. Component prop not receiving full object?')
    
    console.log('\n=== Next Steps ===')
    console.log('Run browser with DevTools open on localhost:3000')
    console.log('Look for logs:')
    console.log('  - [SLA] Fetched tickets: X tickets')
    console.log('  - [SLA] First case metadata: ...')
    console.log('  - [CaseDetail] caseData FULL object: ...')
    console.log('\n')
    
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

testCaseMetadata()

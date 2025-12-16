#!/usr/bin/env node

/**
 * Wazuh Integration Test Script
 * 
 * Usage: npx ts-node scripts/test-wazuh-integration.ts
 * 
 * This script tests the Wazuh integration by:
 * 1. Verifying Elasticsearch connectivity
 * 2. Fetching sample alerts
 * 3. Testing alert storage in database
 * 4. Verifying status management
 */

import { WazuhClient } from "@/lib/api/wazuh-client"
import prisma from "@/lib/prisma"

interface TestResult {
  name: string
  passed: boolean
  message: string
  error?: string
}

const results: TestResult[] = []

async function testElasticsearchConnection() {
  console.log("\n📡 Testing Elasticsearch Connection...")

  try {
    const host = process.env.WAZUH_ELASTICSEARCH_URL || ""
    const username = process.env.WAZUH_ELASTICSEARCH_USERNAME || ""
    const password = process.env.WAZUH_ELASTICSEARCH_PASSWORD || ""

    if (!host || !username || !password) {
      throw new Error(
        "Missing Wazuh credentials. Set WAZUH_ELASTICSEARCH_URL, WAZUH_ELASTICSEARCH_USERNAME, WAZUH_ELASTICSEARCH_PASSWORD"
      )
    }

    const client = new WazuhClient({
      elasticsearch_url: host,
      elasticsearch_username: username,
      elasticsearch_password: password,
      elasticsearch_index: "wazuh-*",
    })

    // Try to fetch alerts
    const alerts = await client.searchAlerts()

    results.push({
      name: "Elasticsearch Connection",
      passed: true,
      message: `Successfully connected! Found ${alerts.length} alerts`,
    })

    console.log(`✅ Connected to Elasticsearch - found ${alerts.length} alerts`)

    if (alerts.length > 0) {
      console.log("\n📋 Sample Alert:")
      const sample = alerts[0]
      console.log(`  ID: ${sample.externalId}`)
      console.log(`  Title: ${sample.title}`)
      console.log(`  Severity: ${sample.severity}`)
      console.log(`  Agent: ${sample.agent.name} (${sample.agent.ip})`)
      console.log(`  Rule: ${sample.rule.description}`)
    }

    return alerts
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    results.push({
      name: "Elasticsearch Connection",
      passed: false,
      message: "Failed to connect to Elasticsearch",
      error: message,
    })

    console.error(`❌ Failed: ${message}`)
    return []
  }
}

async function testDatabaseIntegration() {
  console.log("\n💾 Testing Database Integration Setup...")

  try {
    // Check if Wazuh integration exists in database
    const integration = await prisma.integration.findFirst({
      where: { source: "wazuh" },
    })

    if (!integration) {
      results.push({
        name: "Database Integration",
        passed: false,
        message: "No Wazuh integration found in database",
        error: "Please create a Wazuh integration in the dashboard first",
      })

      console.error("❌ No Wazuh integration found in database")
      return false
    }

    results.push({
      name: "Database Integration",
      passed: true,
      message: `Found integration: ${integration.name} (${integration.id})`,
    })

    console.log(`✅ Found integration: ${integration.name}`)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    results.push({
      name: "Database Integration",
      passed: false,
      message: "Failed to query database",
      error: message,
    })

    console.error(`❌ Failed: ${message}`)
    return false
  }
}

async function testAlertStorage() {
  console.log("\n💾 Testing Alert Storage...")

  try {
    // Count existing Wazuh alerts
    const wazuhIntegration = await prisma.integration.findFirst({
      where: { source: "wazuh" },
    })

    if (!wazuhIntegration) {
      results.push({
        name: "Alert Storage",
        passed: false,
        message: "Wazuh integration not found",
      })
      return
    }

    const alertCount = await prisma.alert.count({
      where: { integrationId: wazuhIntegration.id },
    })

    results.push({
      name: "Alert Storage",
      passed: true,
      message: `Found ${alertCount} Wazuh alerts in database`,
    })

    console.log(`✅ Database contains ${alertCount} Wazuh alerts`)

    if (alertCount > 0) {
      // Show sample alert
      const sampleAlert = await prisma.alert.findFirst({
        where: { integrationId: wazuhIntegration.id },
      })

      if (sampleAlert) {
        console.log("\n📋 Sample Alert from Database:")
        console.log(`  External ID: ${sampleAlert.externalId}`)
        console.log(`  Title: ${sampleAlert.title}`)
        console.log(`  Severity: ${sampleAlert.severity}`)
        console.log(`  Status: ${sampleAlert.status}`)
        console.log(`  Timestamp: ${sampleAlert.timestamp}`)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    results.push({
      name: "Alert Storage",
      passed: false,
      message: "Failed to test alert storage",
      error: message,
    })

    console.error(`❌ Failed: ${message}`)
  }
}

async function testStatusUpdate() {
  console.log("\n🔄 Testing Alert Status Update...")

  try {
    const wazuhIntegration = await prisma.integration.findFirst({
      where: { source: "wazuh" },
    })

    if (!wazuhIntegration) {
      results.push({
        name: "Status Update",
        passed: false,
        message: "Wazuh integration not found",
      })
      return
    }

    // Get a sample alert
    const alert = await prisma.alert.findFirst({
      where: { integrationId: wazuhIntegration.id },
    })

    if (!alert) {
      results.push({
        name: "Status Update",
        passed: false,
        message: "No Wazuh alerts found to test status update",
      })
      return
    }

    // Test status update
    const updated = await prisma.alert.update({
      where: { id: alert.id },
      data: {
        status: "In Progress",
        metadata: {
          ...(typeof alert.metadata === "object" ? alert.metadata : {}),
          statusUpdatedAt: new Date().toISOString(),
        },
      },
    })

    // Verify update
    if (updated.status === "In Progress") {
      results.push({
        name: "Status Update",
        passed: true,
        message: `Successfully updated alert status to: ${updated.status}`,
      })

      console.log(`✅ Alert status updated successfully to: ${updated.status}`)

      // Reset for next test
      await prisma.alert.update({
        where: { id: alert.id },
        data: { status: "Open" },
      })
    } else {
      throw new Error("Status update verification failed")
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    results.push({
      name: "Status Update",
      passed: false,
      message: "Failed to test status update",
      error: message,
    })

    console.error(`❌ Failed: ${message}`)
  }
}

async function runTests() {
  console.log("═════════════════════════════════════════════")
  console.log("    Wazuh Integration Test Suite")
  console.log("═════════════════════════════════════════════")

  // Run tests
  await testElasticsearchConnection()
  await testDatabaseIntegration()
  await testAlertStorage()
  await testStatusUpdate()

  // Print results
  console.log("\n═════════════════════════════════════════════")
  console.log("    Test Results")
  console.log("═════════════════════════════════════════════\n")

  let passed = 0
  let failed = 0

  results.forEach((result) => {
    const status = result.passed ? "✅ PASS" : "❌ FAIL"
    console.log(`${status} | ${result.name}`)
    console.log(`       ${result.message}`)
    if (result.error) {
      console.log(`       Error: ${result.error}`)
    }
    console.log()

    if (result.passed) passed++
    else failed++
  })

  console.log("═════════════════════════════════════════════")
  console.log(`Total: ${passed} passed, ${failed} failed`)
  console.log("═════════════════════════════════════════════\n")

  if (failed > 0) {
    process.exit(1)
  }
}

// Main execution
runTests().catch((error) => {
  console.error("Test suite failed:", error)
  process.exit(1)
})

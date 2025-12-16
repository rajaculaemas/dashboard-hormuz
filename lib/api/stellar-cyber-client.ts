import { getAlerts, getAccessToken } from "./stellar-cyber"
import type { StellarCyberAlert } from "@/lib/config/stellar-cyber"

interface StellarCyberCredentials {
  host: string
  user_id: string
  refresh_token: string
  tenant_id: string
}

export async function fetchAlertsFromStellarCyber(
  credentials: StellarCyberCredentials,
  params?: {
    limit?: number
    minScore?: number
    status?: string
  },
): Promise<StellarCyberAlert[]> {
  try {
    console.log("Fetching alerts from Stellar Cyber with credentials:", {
      host: credentials.host ? "provided" : "missing",
      user_id: credentials.user_id ? "provided" : "missing",
      refresh_token: credentials.refresh_token ? "provided" : "missing",
      tenant_id: credentials.tenant_id ? "provided" : "missing",
    })

    // Temporarily set environment variables for the API call
    const originalEnv = {
      STELLAR_CYBER_HOST: process.env.STELLAR_CYBER_HOST,
      STELLAR_CYBER_USER_ID: process.env.STELLAR_CYBER_USER_ID,
      STELLAR_CYBER_REFRESH_TOKEN: process.env.STELLAR_CYBER_REFRESH_TOKEN,
      STELLAR_CYBER_TENANT_ID: process.env.STELLAR_CYBER_TENANT_ID,
    }

    // Set credentials as environment variables temporarily
    process.env.STELLAR_CYBER_HOST = credentials.host
    process.env.STELLAR_CYBER_USER_ID = credentials.user_id
    process.env.STELLAR_CYBER_REFRESH_TOKEN = credentials.refresh_token
    process.env.STELLAR_CYBER_TENANT_ID = credentials.tenant_id

    try {
      // Call the getAlerts function with the credentials
      const alerts = await getAlerts({
        limit: params?.limit || 1000,
        minScore: params?.minScore || 0,
        status: params?.status as any,
      })

      console.log(`Successfully fetched ${alerts.length} alerts from Stellar Cyber`)
      return alerts
    } finally {
      // Restore original environment variables
      process.env.STELLAR_CYBER_HOST = originalEnv.STELLAR_CYBER_HOST
      process.env.STELLAR_CYBER_USER_ID = originalEnv.STELLAR_CYBER_USER_ID
      process.env.STELLAR_CYBER_REFRESH_TOKEN = originalEnv.STELLAR_CYBER_REFRESH_TOKEN
      process.env.STELLAR_CYBER_TENANT_ID = originalEnv.STELLAR_CYBER_TENANT_ID
    }
  } catch (error) {
    console.error("Error fetching alerts from Stellar Cyber:", error)
    throw error
  }
}

export async function testStellarCyberConnection(credentials: StellarCyberCredentials): Promise<{
  success: boolean
  message: string
  details?: any
}> {
  try {
    console.log("Testing Stellar Cyber connection...")

    // Temporarily set environment variables for the test
    const originalEnv = {
      STELLAR_CYBER_HOST: process.env.STELLAR_CYBER_HOST,
      STELLAR_CYBER_USER_ID: process.env.STELLAR_CYBER_USER_ID,
      STELLAR_CYBER_REFRESH_TOKEN: process.env.STELLAR_CYBER_REFRESH_TOKEN,
      STELLAR_CYBER_TENANT_ID: process.env.STELLAR_CYBER_TENANT_ID,
    }

    process.env.STELLAR_CYBER_HOST = credentials.host
    process.env.STELLAR_CYBER_USER_ID = credentials.user_id
    process.env.STELLAR_CYBER_REFRESH_TOKEN = credentials.refresh_token
    process.env.STELLAR_CYBER_TENANT_ID = credentials.tenant_id

    try {
      // Test getting access token
      const token = await getAccessToken()

      if (!token || token === "dummy-access-token-for-development" || token === "error-token-for-fallback") {
        return {
          success: false,
          message: "Failed to obtain valid access token",
          details: { token: token ? "received" : "none" },
        }
      }

      // Test fetching a small number of alerts
      const testAlerts = await getAlerts({ limit: 1 })

      return {
        success: true,
        message: "Connection successful",
        details: {
          token: "valid",
          alertsAvailable: testAlerts.length,
        },
      }
    } finally {
      // Restore original environment variables
      process.env.STELLAR_CYBER_HOST = originalEnv.STELLAR_CYBER_HOST
      process.env.STELLAR_CYBER_USER_ID = originalEnv.STELLAR_CYBER_USER_ID
      process.env.STELLAR_CYBER_REFRESH_TOKEN = originalEnv.STELLAR_CYBER_REFRESH_TOKEN
      process.env.STELLAR_CYBER_TENANT_ID = originalEnv.STELLAR_CYBER_TENANT_ID
    }
  } catch (error) {
    console.error("Error testing Stellar Cyber connection:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error occurred",
      details: { error: error instanceof Error ? error.message : "Unknown error" },
    }
  }
}

export async function updateAlertStatusInStellarCyber(params: {
  credentials: StellarCyberCredentials
  alertId: string
  index?: string
  status: string
  comments?: string
}): Promise<void> {
  try {
    // Minimal placeholder implementation: attempt to call Stellar Cyber APIs when available.
    console.log('updateAlertStatusInStellarCyber called with', {
      alertId: params.alertId,
      index: params.index,
      status: params.status,
    })

    // In a real implementation, use getAccessToken() and Stellar Cyber APIs to update the alert status.
    // This placeholder intentionally does nothing to avoid side effects during type-checking.
    return
  } catch (error) {
    console.error('Error in updateAlertStatusInStellarCyber:', error)
    throw error
  }
}

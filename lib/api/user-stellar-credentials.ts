import prisma from "@/lib/prisma"

/**
 * Get user's Stellar Cyber API key
 */
export async function getUserStellarApiKey(userId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stellar_cyber_api_key: true },
    })
    return user?.stellar_cyber_api_key || null
  } catch (error) {
    console.error("Error fetching user Stellar API key:", error)
    return null
  }
}

/**
 * Check if user has Stellar Cyber API key configured
 */
export async function userHasStellarApiKey(userId: string): Promise<boolean> {
  const apiKey = await getUserStellarApiKey(userId)
  return !!apiKey
}

/**
 * Save or update user's Stellar Cyber API key
 */
export async function setStellarApiKey(userId: string, apiKey: string): Promise<boolean> {
  try {
    // Validate that apiKey is not empty
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error("API key cannot be empty")
    }

    // Validate basic format (should be non-empty string)
    if (apiKey.length < 10) {
      throw new Error("API key seems too short to be valid")
    }

    await prisma.user.update({
      where: { id: userId },
      data: { stellar_cyber_api_key: apiKey.trim() },
    })
    return true
  } catch (error) {
    console.error("Error setting user Stellar API key:", error)
    throw error
  }
}

/**
 * Delete user's Stellar Cyber API key
 */
export async function deleteStellarApiKey(userId: string): Promise<boolean> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { stellar_cyber_api_key: null },
    })
    return true
  } catch (error) {
    console.error("Error deleting user Stellar API key:", error)
    throw error
  }
}

/**
 * Validate Stellar API key by making a test call to Stellar Cyber
 * (Optional: can be implemented later with actual API validation)
 */
export async function validateStellarApiKey(
  apiKey: string,
  stellarHost: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    // For now, just do basic validation
    // In production, you could make an actual test API call
    if (!apiKey || apiKey.trim().length === 0) {
      return { valid: false, error: "API key cannot be empty" }
    }

    if (apiKey.length < 10) {
      return { valid: false, error: "API key seems invalid" }
    }

    if (!stellarHost || stellarHost.length === 0) {
      return { valid: false, error: "Stellar host is not configured" }
    }

    return { valid: true }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

/**
 * Get admin user count (for checking if admin exists)
 */
export async function getAdminUserCount(): Promise<number> {
  try {
    const count = await prisma.user.count({
      where: { role: "administrator" },
    })
    return count
  } catch (error) {
    console.error("Error getting admin count:", error)
    return 0
  }
}

/**
 * Get JWT API key for specific Stellar Cyber host
 */
export async function getUserStellarApiKeyForHost(
  userId: string,
  host: string,
): Promise<string | null> {
  try {
    const credential = await prisma.userStellarCyberHostCredential.findUnique({
      where: {
        userId_host: {
          userId,
          host,
        },
      },
      select: { apiKey: true },
    })
    return credential?.apiKey || null
  } catch (error) {
    console.error(`Error fetching Stellar API key for host ${host}:`, error)
    return null
  }
}

/**
 * Save or update JWT API key for specific Stellar Cyber host
 */
export async function setStellarApiKeyForHost(
  userId: string,
  host: string,
  apiKey: string,
): Promise<boolean> {
  try {
    // Validate that apiKey is not empty
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error("API key cannot be empty")
    }

    // Validate basic format
    if (apiKey.length < 10) {
      throw new Error("API key seems too short to be valid")
    }

    // Validate host format
    if (!host || host.trim().length === 0) {
      throw new Error("Host cannot be empty")
    }

    // Upsert the credential
    await prisma.userStellarCyberHostCredential.upsert({
      where: {
        userId_host: {
          userId,
          host,
        },
      },
      update: { apiKey: apiKey.trim() },
      create: {
        userId,
        host,
        apiKey: apiKey.trim(),
      },
    })

    return true
  } catch (error) {
    console.error(`Error setting Stellar API key for host ${host}:`, error)
    throw error
  }
}

/**
 * Delete JWT API key for specific Stellar Cyber host
 */
export async function deleteStellarApiKeyForHost(
  userId: string,
  host: string,
): Promise<boolean> {
  try {
    await prisma.userStellarCyberHostCredential.deleteMany({
      where: {
        userId,
        host,
      },
    })
    return true
  } catch (error) {
    console.error(`Error deleting Stellar API key for host ${host}:`, error)
    throw error
  }
}

/**
 * Get all Stellar Cyber API keys for a user by host
 */
export async function getUserStellarApiKeysByHost(userId: string) {
  try {
    console.log(`[getUserStellarApiKeysByHost] Fetching credentials for userId: ${userId}`)
    const credentials = await prisma.userStellarCyberHostCredential.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    })
    console.log(`[getUserStellarApiKeysByHost] Found ${credentials.length} credentials:`, 
      credentials.map(c => ({ host: c.host, hasKey: !!c.apiKey })))
    return credentials
  } catch (error) {
    console.error("Error fetching user Stellar API keys by host:", error)
    return []
  }
}

/**
 * DEPRECATED: Get API keys for integrations (integration-based, old approach)
 * Kept for backward compatibility with integrations-based routes
 */
export async function getUserStellarApiKeysWithIntegrations(userId: string) {
  try {
    // Get all integrations for user and their credentials
    const integrations = await prisma.integration.findMany({
      where: {
        userId,
        serviceName: "stellar_cyber",
      },
      select: {
        id: true,
        name: true,
        credentials: true,
      },
    })

    // For each integration, try to get API key for its host
    const apiKeysByIntegration = []

    for (const integration of integrations) {
      // Extract host from credentials
      let hostFromIntegration: string | null = null
      const credentials = Array.isArray(integration.credentials)
        ? integration.credentials
        : [integration.credentials]

      for (const cred of credentials) {
        if (typeof cred === "object" && cred !== null && "host" in cred) {
          hostFromIntegration = cred.host as string
          break
        }
      }

      // Try to get API key for this integration's host
      let apiKey: string | null = null

      if (hostFromIntegration) {
        const hostKey = await prisma.userStellarCyberHostCredential.findUnique({
          where: {
            userId_host: {
              userId,
              host: hostFromIntegration,
            },
          },
          select: { apiKey: true },
        })
        apiKey = hostKey?.apiKey || null
      }

      apiKeysByIntegration.push({
        integrationId: integration.id,
        integrationName: integration.name,
        host: hostFromIntegration,
        hasApiKey: !!apiKey,
        apiKey: apiKey ? "***MASKED***" : null,
      })
    }

    return apiKeysByIntegration
  } catch (error) {
    console.error("Error fetching Stellar API keys with integrations:", error)
    return []
  }
}

/**
 * DEPRECATED: Set API key for specific integration (integration-based, old approach)
 * This maps to the host-based approach internally for consistency
 */
export async function setStellarApiKeyForIntegration(
  userId: string,
  integrationId: string,
  apiKey: string,
): Promise<boolean> {
  try {
    // Find the integration to get its host
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId },
      select: { credentials: true },
    })

    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`)
    }

    // Extract host from credentials
    let hostFromIntegration: string | null = null
    const credentials = Array.isArray(integration.credentials)
      ? integration.credentials
      : [integration.credentials]

    for (const cred of credentials) {
      if (typeof cred === "object" && cred !== null && "host" in cred) {
        hostFromIntegration = cred.host as string
        break
      }
    }

    if (!hostFromIntegration) {
      throw new Error("Could not find host in integration credentials")
    }

    // Use the host-based setter internally
    return setStellarApiKeyForHost(userId, hostFromIntegration, apiKey)
  } catch (error) {
    console.error(`Error setting Stellar API key for integration ${integrationId}:`, error)
    throw error
  }
}

/**
 * DEPRECATED: Delete API key for specific integration (integration-based, old approach)
 * This maps to the host-based approach internally for consistency
 */
export async function deleteStellarApiKeyForIntegration(
  userId: string,
  integrationId: string,
): Promise<boolean> {
  try {
    // Find the integration to get its host
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId },
      select: { credentials: true },
    })

    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`)
    }

    // Extract host from credentials
    let hostFromIntegration: string | null = null
    const credentials = Array.isArray(integration.credentials)
      ? integration.credentials
      : [integration.credentials]

    for (const cred of credentials) {
      if (typeof cred === "object" && cred !== null && "host" in cred) {
        hostFromIntegration = cred.host as string
        break
      }
    }

    if (!hostFromIntegration) {
      throw new Error("Could not find host in integration credentials")
    }

    // Use the host-based deleter internally
    return deleteStellarApiKeyForHost(userId, hostFromIntegration)
  } catch (error) {
    console.error(
      `Error deleting Stellar API key for integration ${integrationId}:`,
      error,
    )
    throw error
  }
}


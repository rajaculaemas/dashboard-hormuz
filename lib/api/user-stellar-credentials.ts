import prisma from "@/lib/prisma"

/**
 * Get user's Stellar Cyber API key
 */
export async function getUserStellarApiKey(userId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stellarCyberApiKey: true },
    })
    return user?.stellarCyberApiKey || null
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
      data: { stellarCyberApiKey: apiKey.trim() },
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
      data: { stellarCyberApiKey: null },
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

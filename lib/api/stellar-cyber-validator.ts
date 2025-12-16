import type { StellarCyberAlert } from "@/lib/config/stellar-cyber"

/**
 * Fungsi untuk memvalidasi dan memperbaiki format data alert dari Stellar Cyber
 * Beberapa implementasi API Stellar Cyber mungkin memiliki format yang berbeda
 */
export function validateAndFixAlerts(data: any): StellarCyberAlert[] {
  console.log("Validating Stellar Cyber response format")

  // Jika data adalah array, periksa apakah memiliki format yang benar
  if (Array.isArray(data)) {
    console.log(`Received array with ${data.length} items`)

    // Periksa item pertama untuk menentukan format
    if (data.length > 0) {
      const firstItem = data[0]

      // Periksa apakah memiliki properti yang diharapkan
      if (firstItem._id && firstItem.title) {
        console.log("Data appears to be in the expected format")
        return data as StellarCyberAlert[]
      } else {
        console.warn("Array items don't match expected format:", firstItem)
      }
    } else {
      console.log("Received empty array")
      return []
    }
  }

  // Jika data adalah objek, periksa apakah memiliki properti 'cases' atau 'alerts'
  else if (typeof data === "object" && data !== null) {
    console.log("Received object instead of array")

    // Beberapa implementasi API mungkin mengembalikan { cases: [...] }
    if (Array.isArray(data.cases)) {
      console.log(`Found 'cases' array with ${data.cases.length} items`)
      return data.cases as StellarCyberAlert[]
    }

    // Atau mungkin { alerts: [...] }
    else if (Array.isArray(data.alerts)) {
      console.log(`Found 'alerts' array with ${data.alerts.length} items`)
      return data.alerts as StellarCyberAlert[]
    }

    // Atau mungkin { data: [...] }
    else if (Array.isArray(data.data)) {
      console.log(`Found 'data' array with ${data.data.length} items`)
      return data.data as StellarCyberAlert[]
    }

    // Atau mungkin { results: [...] }
    else if (Array.isArray(data.results)) {
      console.log(`Found 'results' array with ${data.results.length} items`)
      return data.results as StellarCyberAlert[]
    }

    console.warn("Could not find alerts array in response object:", Object.keys(data))
  } else {
    console.error("Received invalid data type:", typeof data)
  }

  // Jika tidak dapat memvalidasi format, kembalikan array kosong
  return []
}

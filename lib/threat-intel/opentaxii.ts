// === lib/threat-intel/opentaxii.ts ===
import axios from 'axios';

const OPENTAXII_API_BASE = process.env.OPENTAXII_API_BASE || 'http://localhost:9000';

export async function checkWithOpenTAXII(ioc: string): Promise<string> {
  try {
    const response = await axios.get(`${OPENTAXII_API_BASE}/taxii2/feeds/ioc?match=${ioc}`);
    const data = response.data;
    if (data && data.matches && data.matches.length > 0) {
      return `OpenTAXII: Match found for ${ioc}. Details: ${JSON.stringify(data.matches[0])}`;
    }
    return `OpenTAXII: No match found for ${ioc}.`;
  } catch (err: any) {
    return `OpenTAXII error: ${err.message}`;
  }
}
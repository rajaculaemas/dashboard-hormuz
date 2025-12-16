// === lib/threat-intel/phishtank.ts ===
import axios from 'axios';

const PHISHTANK_API_KEY = process.env.PHISHTANK_API_KEY || '';

export async function checkWithPhishTank(url: string): Promise<string> {
  try {
    const response = await axios.post(
      'https://phishtank.org/checkurl/',
      new URLSearchParams({ url }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'SOCGPT',
          'API-Key': PHISHTANK_API_KEY
        },
      }
    );

    const results = response.data.results;
    if (results.in_database && results.verified && results.valid) {
      return `PhishTank: VERIFIED phishing URL.`;
    }
    return 'PhishTank: Not in database or unverified.';
  } catch (err: any) {
    return `PhishTank error: ${err.message}`;
  }
}
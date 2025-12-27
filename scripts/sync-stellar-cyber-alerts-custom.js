#!/usr/bin/env node
// Wrapper to run the TypeScript sync script using ts-node's CommonJS register.
// This avoids ESM loader cycles and unknown extension errors in some Node setups.
try {
  require('ts-node').register({ transpileOnly: true })
} catch (e) {
  console.error('ts-node is required but not found. Install with: pnpm add -D ts-node')
  process.exit(1)
}

// Delegate to the TypeScript script (relative path)
require('./sync-stellar-cyber-alerts-custom.ts')

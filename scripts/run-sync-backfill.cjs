// CommonJS launcher to run TypeScript backfill script via ts-node
// Usage: HOURS_BACK=48 INDEX_PATTERN="wazuh-posindonesia_*" node scripts/run-sync-backfill.cjs
try {
  require('ts-node').register({ transpileOnly: true })
  try {
    require('tsconfig-paths').register()
  } catch (e) {
    // tsconfig-paths not installed; path aliases like @/lib may fail
  }
} catch (e) {
  console.error('ts-node not available; please install devDependency ts-node')
  process.exit(1)
}

try {
  // Require the TypeScript script; ts-node register will transpile it on the fly
  require('./sync-wazuh-manual.ts')
} catch (err) {
  console.error('Error running backfill script:', err)
  process.exit(1)
}


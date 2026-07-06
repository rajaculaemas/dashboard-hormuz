/**
 * Next.js Server with Integrated Telegram Polling
 * Polling starts when app starts, stops when app stops
 */

const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const fs = require('fs')
const path = require('path')

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || 'localhost'  
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

let server = null
let shutdownInProgress = false
let pollingInitialized = false
let pollingInitInProgress = false

async function startServer() {
  try {
    console.log('[Server] Preparing Next.js app...')
    await app.prepare()
    console.log('[Server] Next.js app ready')

    server = createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url || '', true)
        
        // Initialize polling on first request (prevent race condition with lock)
        if (!pollingInitialized && !pollingInitInProgress && req.url !== '/_next/static' && !req.url.startsWith('/__next')) {
          pollingInitInProgress = true
          pollingInitialized = true
          console.log('[Server] First request received, initializing polling...')
          
          // Call the polling init endpoint
          try {
            const response = await fetch('http://localhost:3000/api/telegram/polling-init', { 
              method: 'POST' 
            })
            if (response.ok) {
              console.log('[Server] ✅ Polling initialized successfully')
            } else {
              console.warn('[Server] ⚠️ Polling init returned non-200 status:', response.status)
            }
          } catch (error) {
            console.log('[Server] Polling init endpoint error:', error.message)
          } finally {
            pollingInitInProgress = false
          }
        }
        
        await handle(req, res, parsedUrl)
      } catch (err) {
        console.error('[Server] Error:', err)
        res.statusCode = 500
        res.end('internal server error')
      }
    })

    await new Promise((resolve) => {
      server.listen(port, () => {
        console.log(`[Server] ✅ Ready on http://${hostname}:${port}`)
        resolve()
      })
    })

    // Internal shift recap interval: check every 60 seconds
    let shiftRecapIntervalStarted = false
    setTimeout(() => {
      // Wait 10 seconds after server ready before first check
      const runShiftRecap = async () => {
        try {
          const secret = process.env.CRON_SECRET
          if (!secret) return
          const res = await fetch(`http://localhost:${port}/api/cron/shift-recap`, {
            headers: { 'x-cron-secret': secret }
          })
          if (res.ok) {
            const data = await res.json()
            if (data.processed > 0) {
              console.log(`[ShiftRecap] ✅ Sent ${data.processed} recap notification(s)`)
            }
          }
        } catch (e) {
          // Silently ignore - server may be mid-restart
        }
      }
      runShiftRecap()
      if (!shiftRecapIntervalStarted) {
        shiftRecapIntervalStarted = true
        setInterval(runShiftRecap, 60 * 1000)
      }
    }, 10000)

    // Internal escalation timeout check: check every 30 seconds
    let escalationTimeoutIntervalStarted = false
    setTimeout(() => {
      // Wait 5 seconds after server ready before first check
      const runEscalationTimeoutCheck = async () => {
        try {
          const secret = process.env.CRON_SECRET
          if (!secret) {
            console.warn('[EscalationTimeout] CRON_SECRET not configured')
            return
          }
          const res = await fetch(`http://localhost:${port}/api/cron/escalation-timeout-check`, {
            headers: { 'x-cron-secret': secret }
          })
          if (res.ok) {
            const data = await res.json()
            console.log(`[EscalationTimeout] Check completed - ${data.message}`)
          } else {
            console.warn(`[EscalationTimeout] Check failed with status ${res.status}`)
          }
        } catch (e) {
          console.error('[EscalationTimeout] Check error:', e.message)
        }
      }
      runEscalationTimeoutCheck()
      if (!escalationTimeoutIntervalStarted) {
        escalationTimeoutIntervalStarted = true
        console.log('[EscalationTimeout] ✅ Interval started - checking every 30 seconds')
        setInterval(runEscalationTimeoutCheck, 30 * 1000)
      }
    }, 5000)

    // Graceful shutdown
    const shutdown = async (signal) => {
      if (shutdownInProgress) return
      shutdownInProgress = true
      
      console.log(`\n[Server] ${signal} received, shutting down...`)
      
      // Stop polling
      try {
        await fetch('http://localhost:3000/api/telegram/polling-stop', {
          method: 'POST'
        }).catch(() => {})
      } catch (error) {
        console.log('[Server] Polling stop error (ignored)')
      }

      if (server) {
        server.close(() => {
          console.log('[Server] ✅ Shutdown complete')
          process.exit(0)
        })
        
        setTimeout(() => {
          console.error('[Server] ⚠️  Forced exit after timeout')
          process.exit(1)
        }, 10000)
      } else {
        process.exit(0)
      }
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('uncaughtException', (err) => {
      console.error('[Server] Uncaught exception:', err)
      shutdown('uncaughtException')
    })
  } catch (error) {
    console.error('[Server] Fatal error:', error)
    process.exit(1)
  }
}

startServer()

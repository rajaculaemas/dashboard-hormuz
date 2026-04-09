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

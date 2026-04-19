import 'dotenv/config'
import http from 'http'
import { createApp } from './app.js'
import { createSocketServer } from './socket/index.js'
import { ensureBucket } from './lib/minio.js'
import './queues/index.js'
import './queues/worker.js'

const PORT = parseInt(process.env.PORT ?? '4000', 10)

async function start() {
  const app = createApp()
  const server = http.createServer(app)
  createSocketServer(server)

  await ensureBucket()

  server.listen(PORT, () => {
    console.log(`✓ API server running at http://localhost:${PORT}`)
  })
}

start().catch((err) => {
  console.error('Failed to start API server:', err)
  process.exit(1)
})

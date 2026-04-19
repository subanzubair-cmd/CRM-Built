import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import routes from './routes/index.js'
import webhooks from './routes/webhooks.js'
import { errorHandler } from './middleware/error.js'

export function createApp() {
  const app = express()

  app.use(cors({ origin: process.env.NEXTAUTH_URL ?? 'http://localhost:3000', credentials: true }))
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  app.use('/api', routes)
  app.use('/api/webhooks', webhooks)

  app.use(errorHandler)

  return app
}

import type { Server as HttpServer } from 'http'
import { Server as SocketServer } from 'socket.io'

export function createSocketServer(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
      credentials: true,
    },
  })

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`)
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`)
    })
  })

  console.log('✓ Socket.io server initialized')
  return io
}

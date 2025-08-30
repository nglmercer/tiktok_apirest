import { Hono } from 'hono'
import { upgradeWebSocket, websocket } from 'hono/bun'
import { cors } from 'hono/cors'
import { io,type WebSocketData } from './websocket-adapter'
import {TiktokFunctions,TiktokEventsArray} from './platforms/tiktoklive'
import { WebcastEvent } from 'tiktok-live-connector';
import { ServerWebSocket } from 'bun';
import { emitter } from './Emitter'
const app = new Hono()
app.use(cors({
  origin: '*',
}))


// Set up connection handler
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`)
 
  // Join a default room
  socket.join('general')
 
  // Handle custom events
  socket.on('message', (data: any) => {
    console.log(`Message from ${socket.id}:`, data)
    socket.emit('echo', data)
    socket.to('general').emit('broadcast', `${socket.id} says: ${data}`)
  })
 
  socket.on('join-room', (room: string) => {
    socket.leave('general')
    socket.join(room)
    socket.emit('joined', `You joined room: ${room}`)
    socket.to(room).emit('user-joined', `${socket.id} joined the room`)
  })
 
  socket.on('private-message', ({targetSocketId, message}) => {
    const targetSocket = io.clients.get(targetSocketId)
    if (targetSocket) {
      targetSocket.emit('private-message', {
        from: socket.id,
        message
      })
    } else {
      socket.emit('error', `User ${targetSocketId} not found or disconnected.`)
    }
  })

  socket.on('live:tiktok',async (tiktokUsername: string) => {
    console.log("live:tiktok", tiktokUsername)
    await TiktokFunctions.createLiveIfNotExist(tiktokUsername);
    TiktokFunctions.getLive(tiktokUsername);
    emitter.on('tiktok:connected', (data) => {
      if(data.tiktokUsername === tiktokUsername){
        socket.emit('tiktok:connected', data)
      }
    })
    emitter.on('tiktok:event', (data) => {
      if(data.tiktokUsername === tiktokUsername){
        socket.emit('tiktok:event', data)
      }
    })
    emitter.on('tiktok:disconnected', (data) => {
      if(data.tiktokUsername === tiktokUsername){
        socket.emit('tiktok:disconnected', data)
      }
    })
  })

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
  })
})

// WebSocket route - Use Hono's upgradeWebSocket with the adapter's handler
app.get(
  '/ws',
  upgradeWebSocket((c) => {
    return {
      onOpen: (event, ws) => {
        // Usamos ws.raw para pasar el objeto nativo de Bun al adaptador
        io.handleOpen(ws.raw as ServerWebSocket<WebSocketData>);
      },

      onMessage: (event, ws) => {
        // Usamos ws.raw aquí también
        io.handleMessage(ws.raw as ServerWebSocket<WebSocketData>, event.data.toString());
      },
      onClose: (event, ws) => {
        // Y aquí también
        io.handleClose(ws.raw as ServerWebSocket<WebSocketData>, event.code, event.reason);
      },
      onError: (event, ws) => {
        console.error('Error de WebSocket:', event)
        // Opcional: notificar al adaptador si tienes un manejador de errores
        // io.handleError(ws.raw, event.error);
      }
    }
  })
)

// --- THIS IS THE FIX ---
// You MUST export the websocket object to enable the feature in Bun,
// even though Hono's middleware will handle the logic for the '/ws' route.
const server = Bun.serve({
  fetch: app.fetch,
  port: 8081,
  websocket,
});

import { WebSocket, WebSocketServer, type RawData } from 'ws'

type Role = 'sender' | 'receiver'

type JoinMessage = { type: 'join'; room: string; role: Role }
type SignalMessage = { type: 'signal'; room: string; role: Role; data: unknown }

type ClientMessage = JoinMessage | SignalMessage

type ServerMessage =
  | { type: 'joined'; room: string; role: Role }
  | { type: 'peer'; room: string; role: Role; online: boolean }
  | { type: 'signal'; room: string; role: Role; data: unknown }
  | { type: 'error'; message: string }

type RoomState = {
  sender?: WebSocket
  receiver?: WebSocket
  createdAt: number
  updatedAt: number
}

function jsonParseSafe(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function isRole(x: unknown): x is Role {
  return x === 'sender' || x === 'receiver'
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.trim().length > 0
}

function toClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'object' || raw === null) return null
  const msg = raw as { type?: unknown; room?: unknown; role?: unknown; data?: unknown }
  if (msg.type === 'join') {
    if (!isNonEmptyString(msg.room) || !isRole(msg.role)) return null
    return { type: 'join', room: msg.room.trim(), role: msg.role }
  }
  if (msg.type === 'signal') {
    if (!isNonEmptyString(msg.room) || !isRole(msg.role)) return null
    return { type: 'signal', room: msg.room.trim(), role: msg.role, data: msg.data }
  }
  return null
}

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify(msg))
}

function rawToString(data: RawData): string {
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  return Buffer.from(data).toString('utf8')
}

function nowMs() {
  return Date.now()
}

const portRaw = process.env.PORT ?? process.env.MP_SIGNAL_PORT ?? '8787'
const port = Number.parseInt(portRaw, 10)
if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT: ${portRaw}`)
}

const wss = new WebSocketServer({ port })
const rooms = new Map<string, RoomState>()

function getOtherRole(role: Role): Role {
  return role === 'sender' ? 'receiver' : 'sender'
}

function getRoom(room: string): RoomState {
  const existing = rooms.get(room)
  if (existing) return existing
  const created: RoomState = { createdAt: nowMs(), updatedAt: nowMs() }
  rooms.set(room, created)
  return created
}

function setConn(state: RoomState, role: Role, ws: WebSocket) {
  state.updatedAt = nowMs()
  if (role === 'sender') state.sender = ws
  else state.receiver = ws
}

function clearConn(state: RoomState, role: Role, ws: WebSocket) {
  const current = role === 'sender' ? state.sender : state.receiver
  if (current !== ws) return
  if (role === 'sender') state.sender = undefined
  else state.receiver = undefined
  state.updatedAt = nowMs()
}

function maybeDeleteRoom(room: string, state: RoomState) {
  if (state.sender || state.receiver) return
  rooms.delete(room)
}

function broadcastPeer(room: string, state: RoomState, role: Role, online: boolean) {
  const sender = state.sender
  const receiver = state.receiver
  if (sender) send(sender, { type: 'peer', room, role, online })
  if (receiver) send(receiver, { type: 'peer', room, role, online })
}

function resolveConn(state: RoomState, role: Role): WebSocket | undefined {
  return role === 'sender' ? state.sender : state.receiver
}

const TTL_MS = 10 * 60 * 1000
setInterval(() => {
  const t = nowMs()
  for (const [room, state] of rooms) {
    if (state.sender || state.receiver) continue
    if (t - state.updatedAt > TTL_MS) rooms.delete(room)
  }
}, 60 * 1000)

wss.on('connection', (ws) => {
  let joinedRoom: string | null = null
  let joinedRole: Role | null = null

  ws.on('message', (buf) => {
    const text = rawToString(buf)
    const raw = jsonParseSafe(text)
    const msg = toClientMessage(raw)
    if (!msg) {
      send(ws, { type: 'error', message: 'Invalid message' })
      return
    }

    if (msg.type === 'join') {
      const room = msg.room
      const role = msg.role

      if (joinedRoom) {
        send(ws, { type: 'error', message: 'Already joined' })
        return
      }

      const state = getRoom(room)
      const existing = resolveConn(state, role)
      if (existing && existing.readyState === WebSocket.OPEN) {
        send(ws, { type: 'error', message: `Room ${room} already has ${role}` })
        return
      }

      joinedRoom = room
      joinedRole = role
      setConn(state, role, ws)
      send(ws, { type: 'joined', room, role })
      broadcastPeer(room, state, role, true)

      const other = getOtherRole(role)
      const otherConn = resolveConn(state, other)
      if (otherConn && otherConn.readyState === WebSocket.OPEN) {
        send(ws, { type: 'peer', room, role: other, online: true })
      }
      return
    }

    // signal
    const room = msg.room
    const role = msg.role
    if (!joinedRoom || !joinedRole || joinedRoom !== room || joinedRole !== role) {
      send(ws, { type: 'error', message: 'Not joined for this room/role' })
      return
    }

    const state = rooms.get(room)
    if (!state) {
      send(ws, { type: 'error', message: 'Room not found' })
      return
    }
    state.updatedAt = nowMs()

    const otherRole = getOtherRole(role)
    const otherConn = resolveConn(state, otherRole)
    if (!otherConn || otherConn.readyState !== WebSocket.OPEN) {
      send(ws, { type: 'error', message: `${otherRole} not connected` })
      return
    }

    send(otherConn, { type: 'signal', room, role, data: msg.data })
  })

  ws.on('close', () => {
    if (!joinedRoom || !joinedRole) return
    const room = joinedRoom
    const role = joinedRole
    const state = rooms.get(room)
    if (!state) return
    clearConn(state, role, ws)
    broadcastPeer(room, state, role, false)
    maybeDeleteRoom(room, state)
  })
})

// eslint-disable-next-line no-console
console.log(`[mpalace-signal] WebSocket signaling server running on ws://0.0.0.0:${port}`)

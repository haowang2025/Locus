import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import QRCode from 'qrcode'
import Peer from 'simple-peer/simplepeer.min.js'
import type { Instance as PeerInstance, SignalData } from 'simple-peer'

import { importMpFileAsNewPalace } from '../lib/backupImport'
import { normalizeRoomCode, normalizeSignalUrl, readSignalUrl, writeSignalUrl } from '../lib/transferSignal'
import type { PalaceRecord } from '../lib/types'
import QrScanner from '../ui/QrScanner'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round((bytes / 1024) * 10) / 10} KB`
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`
}

function parseSignal(text: string): SignalData {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('信令为空')
  const parsed = JSON.parse(trimmed) as unknown
  if (typeof parsed !== 'object' || parsed === null) throw new Error('信令格式错误')
  return parsed as SignalData
}

function toU8(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return null
}

type WsServerMessage =
  | { type: 'joined'; room: string; role: 'sender' | 'receiver' }
  | { type: 'peer'; room: string; role: 'sender' | 'receiver'; online: boolean }
  | { type: 'signal'; room: string; role: 'sender' | 'receiver'; data: unknown }
  | { type: 'error'; message: string }

function parseWsMessage(text: string): WsServerMessage | null {
  try {
    return JSON.parse(text) as WsServerMessage
  } catch {
    return null
  }
}

function isSignalData(x: unknown): x is SignalData {
  return typeof x === 'string' || (typeof x === 'object' && x !== null)
}

type IncomingMeta = { fileName: string; byteLength: number }

export default function TransferReceivePage() {
  const navigate = useNavigate()

  const [phase, setPhase] = useState<
    | { kind: 'init' }
    | { kind: 'need-offer' }
    | { kind: 'answer'; answerText: string; answerQr: string | null }
    | { kind: 'connected' }
    | { kind: 'receiving'; received: number; total: number; fileName: string }
    | { kind: 'importing'; fileName: string }
    | { kind: 'done'; palace: PalaceRecord }
    | { kind: 'error'; message: string }
  >({ kind: 'init' })

  const [offerText, setOfferText] = useState('')
  const [scanOffer, setScanOffer] = useState(false)
  const [signalUrlDraft, setSignalUrlDraft] = useState(() => readSignalUrl())
  const [roomCodeDraft, setRoomCodeDraft] = useState('')
  const [roomBusy, setRoomBusy] = useState<string | null>(null)
  const [roomError, setRoomError] = useState<string | null>(null)
  const [senderOnline, setSenderOnline] = useState<boolean | null>(null)

  const peerRef = useRef<PeerInstance | null>(null)
  const phaseRef = useRef(phase)
  const wsRef = useRef<WebSocket | null>(null)
  const joinedRoomRef = useRef<string | null>(null)
  const answerPublishedRef = useRef(false)
  const offerAppliedRef = useRef(false)
  const incomingRef = useRef<{
    meta: IncomingMeta
    buf: Uint8Array<ArrayBuffer>
    received: number
  } | null>(null)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    return () => {
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [])

  const answerText = useMemo(() => (phase.kind === 'answer' ? phase.answerText : ''), [phase])
  const answerQr = useMemo(() => (phase.kind === 'answer' ? phase.answerQr : null), [phase])

  useEffect(() => {
    const peer: PeerInstance = new Peer({
      initiator: false,
      trickle: false,
      config: {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      },
    })
    peerRef.current = peer
    setPhase({ kind: 'need-offer' })
    joinedRoomRef.current = null
    answerPublishedRef.current = false
    offerAppliedRef.current = false
    setSenderOnline(null)

    peer.on('signal', (data: SignalData) => {
      const text = JSON.stringify(data)
      setPhase({ kind: 'answer', answerText: text, answerQr: null })

      const ws = wsRef.current
      const room = joinedRoomRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN || !room) return
      if (answerPublishedRef.current) return
      answerPublishedRef.current = true
      ws.send(JSON.stringify({ type: 'signal', room, role: 'receiver', data }))
      setRoomBusy('已回传 Answer，连接中…')
    })

    peer.on('connect', () => {
      setPhase({ kind: 'connected' })
    })

    peer.on('data', (data: unknown) => {
      void handleIncomingData(data)
    })

    peer.on('error', (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      setPhase({ kind: 'error', message: msg })
    })

    peer.on('close', () => {
      const p = phaseRef.current
      if (p.kind !== 'done' && p.kind !== 'error') {
        setPhase({ kind: 'error', message: '连接已关闭' })
      }
    })

    return () => {
      try {
        peer.destroy()
      } catch {
        // ignore
      }
      peerRef.current = null
    }
  }, [])

  useEffect(() => {
    let alive = true
    if (!answerText) return
    void (async () => {
      try {
        const url = await QRCode.toDataURL(answerText, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
        if (!alive) return
        setPhase((prev) => (prev.kind === 'answer' ? { kind: 'answer', answerText, answerQr: url } : prev))
      } catch {
        // ignore
      }
    })()
    return () => {
      alive = false
    }
  }, [answerText])

  function closeRoomSocket() {
    wsRef.current?.close()
    wsRef.current = null
    joinedRoomRef.current = null
    answerPublishedRef.current = false
    offerAppliedRef.current = false
    setRoomBusy(null)
    setSenderOnline(null)
  }

  function joinRoom() {
    const peer = peerRef.current
    if (!peer) return

    const url = normalizeSignalUrl(signalUrlDraft)
    if (!url) {
      setRoomError('信令地址无效：请输入 ws:// 或 wss://（也支持 http(s):// 自动转换）')
      return
    }

    const room = normalizeRoomCode(roomCodeDraft)
    if (!room) {
      setRoomError('房间码无效：应为 8 位（如 ABCD-EFGH）')
      return
    }

    closeRoomSocket()

    writeSignalUrl(url)
    setSignalUrlDraft(url)
    setRoomCodeDraft(room)
    setRoomError(null)
    setRoomBusy('连接信令服务器中…')
    setSenderOnline(null)
    answerPublishedRef.current = false
    offerAppliedRef.current = false

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setRoomBusy('加入房间中…')
      ws.send(JSON.stringify({ type: 'join', room, role: 'receiver' }))
    }

    ws.onerror = () => {
      setRoomBusy(null)
      setRoomError('信令连接失败')
    }

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null
      setRoomBusy(null)
    }

    ws.onmessage = (ev) => {
      const msg = typeof ev.data === 'string' ? parseWsMessage(ev.data) : null
      if (!msg) return

      if (msg.type === 'error') {
        setRoomBusy(null)
        setRoomError(msg.message)
        return
      }

      if (msg.type === 'peer' && msg.room === room && msg.role === 'sender') {
        setSenderOnline(msg.online)
        return
      }

      if (msg.type === 'joined' && msg.room === room && msg.role === 'receiver') {
        joinedRoomRef.current = room
        setRoomBusy('等待发送方 Offer…')
        return
      }

      if (msg.type === 'signal' && msg.room === room && msg.role === 'sender') {
        const offer = msg.data
        if (!isSignalData(offer)) return
        if (offerAppliedRef.current) return
        offerAppliedRef.current = true
        try {
          peer.signal(offer)
          setOfferText(JSON.stringify(offer))
          setRoomBusy('已收到 Offer，生成 Answer 中…')
        } catch {
          setRoomBusy(null)
          setRoomError('应用 Offer 失败')
        }
      }
    }
  }

  async function handleIncomingData(msg: unknown) {
    if (typeof msg === 'string') {
      try {
        const parsed = JSON.parse(msg) as unknown
        if (typeof parsed !== 'object' || parsed === null) return
        const meta = parsed as Partial<IncomingMeta & { type: string }>
        if (meta.type !== 'mpalace') return
        if (typeof meta.fileName !== 'string' || typeof meta.byteLength !== 'number') return

        const len = Math.max(0, Math.min(250 * 1024 * 1024, Math.floor(meta.byteLength)))
        incomingRef.current = {
          meta: { fileName: meta.fileName, byteLength: len },
          buf: new Uint8Array(new ArrayBuffer(len)),
          received: 0,
        }
        setPhase({ kind: 'receiving', received: 0, total: len, fileName: meta.fileName })
      } catch {
        // ignore
      }
      return
    }

    const bytes = toU8(msg)
    if (!bytes) return

    const state = incomingRef.current
    if (!state) return

    const remaining = state.meta.byteLength - state.received
    const chunk = bytes.byteLength > remaining ? bytes.subarray(0, remaining) : bytes
    state.buf.set(chunk, state.received)
    state.received += chunk.byteLength
    incomingRef.current = state

    setPhase({ kind: 'receiving', received: state.received, total: state.meta.byteLength, fileName: state.meta.fileName })

    if (state.received >= state.meta.byteLength) {
      setPhase({ kind: 'importing', fileName: state.meta.fileName })
      try {
        const file = new File([state.buf], state.meta.fileName || 'received.mpalace', { type: 'application/octet-stream' })
        const created = await importMpFileAsNewPalace(file)
        setPhase({ kind: 'done', palace: created })
        navigate(`/palace/${created.id}/map`)
      } catch (e) {
        setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      } finally {
        incomingRef.current = null
      }
    }
  }

  function onApplyOffer() {
    const peer = peerRef.current
    if (!peer) return
    try {
      const data = parseSignal(offerText)
      peer.signal(data)
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  async function onCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // ignore
    }
  }

  const receiving = phase.kind === 'receiving'
  const progress = receiving && phase.total > 0 ? Math.max(0, Math.min(1, phase.received / phase.total)) : 0

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">扫码传输（接收）</h1>
        <p className="hint">接收方会导入为一个新宫殿（不会覆盖已有宫殿）。</p>
      </header>

      <main className="page__body">
        <section className="cardbox">
          <h2 className="cardbox__title">房间码（推荐 Quest）</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            发送方先启动房间并给你一个房间码（如 ABCD-EFGH）。你填入后会自动收到 Offer 并回传 Answer。
          </p>
          <label className="field">
            <span className="field__label">信令地址</span>
            <input className="field__input" value={signalUrlDraft} onChange={(e) => setSignalUrlDraft(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">房间码</span>
            <input
              className="field__input"
              placeholder="ABCD-EFGH"
              value={roomCodeDraft}
              onChange={(e) => setRoomCodeDraft(e.target.value)}
            />
          </label>
          <div className="row">
            <button className="btn primary" onClick={joinRoom} disabled={!roomCodeDraft.trim()}>
              加入房间
            </button>
            <button
              className="btn"
              onClick={() => {
                closeRoomSocket()
                setRoomError(null)
                setRoomBusy(null)
              }}
            >
              断开
            </button>
          </div>
          {senderOnline !== null ? (
            <p className="hint" style={{ marginTop: 8 }}>
              发送方：{senderOnline ? '已加入' : '未加入'}
            </p>
          ) : null}
          {roomBusy ? (
            <p className="hint" style={{ marginTop: 8 }}>
              {roomBusy}
            </p>
          ) : null}
          {roomError ? (
            <p className="hint danger-text" style={{ marginTop: 8 }}>
              {roomError}
            </p>
          ) : null}
        </section>

        <section className="cardbox">
          <h2 className="cardbox__title">1) 填入发送方的 “Offer”</h2>
          <div className="row">
            <button className="btn" onClick={() => setScanOffer((v) => !v)}>
              {scanOffer ? '关闭扫码' : '相机扫码'}
            </button>
            <button className="btn primary" onClick={onApplyOffer} disabled={!offerText.trim()}>
              生成 Answer
            </button>
          </div>
          {scanOffer ? (
            <QrScanner
              active={scanOffer}
              onText={(text) => {
                setOfferText(text)
                setScanOffer(false)
              }}
              onError={(m) => setPhase({ kind: 'error', message: m })}
            />
          ) : null}
          <textarea
            className="textarea textarea--small"
            placeholder="粘贴 Offer（JSON）"
            value={offerText}
            onChange={(e) => setOfferText(e.target.value)}
          />
          <p className="hint">如果扫码不可用，可用复制/粘贴交换文本。</p>
        </section>

        <section className="cardbox">
          <h2 className="cardbox__title">2) 把此 “Answer” 给发送方</h2>
          {phase.kind === 'answer' ? (
            <div className="qr">
              {answerQr ? <img className="qr__img" src={answerQr} alt="Answer QR" /> : <p className="hint">生成二维码中…</p>}
              <div className="row">
                <button className="btn" onClick={() => void onCopy(answerText)} disabled={!answerText}>
                  复制 Answer
                </button>
              </div>
              <textarea className="textarea textarea--small" value={answerText} readOnly />
            </div>
          ) : (
            <p className="hint">等待生成 Answer…</p>
          )}
        </section>

        <section className="cardbox">
          <h2 className="cardbox__title">传输状态</h2>
          {phase.kind === 'need-offer' ? <p className="hint">等待 Offer…</p> : null}
          {phase.kind === 'connected' ? <p className="hint">已连接，等待文件…</p> : null}
          {receiving ? (
            <div className="progress">
              <div className="progress__bar">
                <div className="progress__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="hint" style={{ marginTop: 8 }}>
                {phase.fileName} · 已接收 {formatBytes(phase.received)} / {formatBytes(phase.total)}
              </p>
            </div>
          ) : null}
          {phase.kind === 'importing' ? <p className="hint">导入中：{phase.fileName}</p> : null}
          {phase.kind === 'error' ? <p className="hint danger-text">{phase.message}</p> : null}
          <div className="row">
            <Link className="btn" to="/">
              返回首页
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}

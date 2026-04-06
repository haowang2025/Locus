import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import QRCode from 'qrcode'
import Peer from 'simple-peer/simplepeer.min.js'
import type { Instance as PeerInstance, SignalData } from 'simple-peer'

import { getBlobs, getCards, getPalace } from '../lib/db'
import { buildMpFileV1 } from '../lib/mpalace'
import { newRoomCode, normalizeSignalUrl, readSignalUrl, writeSignalUrl } from '../lib/transferSignal'
import type { PalaceRecord } from '../lib/types'
import QrScanner from '../ui/QrScanner'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round((bytes / 1024) * 10) / 10} KB`
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`
}

function safeJsonStringify(data: unknown) {
  try {
    return JSON.stringify(data)
  } catch {
    return ''
  }
}

function parseSignal(text: string): SignalData {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('信令为空')
  const parsed = JSON.parse(trimmed) as unknown
  if (typeof parsed !== 'object' || parsed === null) throw new Error('信令格式错误')
  return parsed as SignalData
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

export default function TransferSendPage() {
  const navigate = useNavigate()
  const { palaceId } = useParams<{ palaceId: string }>()

  const [palace, setPalace] = useState<PalaceRecord | null>(null)
  const [signalUrlDraft, setSignalUrlDraft] = useState(() => readSignalUrl())
  const [roomCode, setRoomCode] = useState(() => newRoomCode())
  const [roomBusy, setRoomBusy] = useState<string | null>(null)
  const [roomError, setRoomError] = useState<string | null>(null)
  const [receiverOnline, setReceiverOnline] = useState<boolean | null>(null)
  const [phase, setPhase] = useState<
    | { kind: 'init' }
    | { kind: 'offer'; offerText: string; offerQr: string | null }
    | { kind: 'connecting'; offerText: string; offerQr: string | null }
    | { kind: 'sending'; sent: number; total: number }
    | { kind: 'done' }
    | { kind: 'error'; message: string }
  >({ kind: 'init' })

  const [answerText, setAnswerText] = useState('')
  const [scanAnswer, setScanAnswer] = useState(false)

  const peerRef = useRef<PeerInstance | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const destroyedRef = useRef(false)
  const phaseRef = useRef(phase)
  const offerRef = useRef<SignalData | null>(null)
  const roomPublishedRef = useRef(false)
  const roomAnswerAppliedRef = useRef(false)

  const offerText = useMemo(() => (phase.kind === 'offer' || phase.kind === 'connecting' ? phase.offerText : ''), [phase])
  const offerQr = useMemo(() => (phase.kind === 'offer' || phase.kind === 'connecting' ? phase.offerQr : null), [phase])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    return () => {
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!palaceId) return
    let alive = true
    void (async () => {
      try {
        const p = await getPalace(palaceId)
        if (!alive) return
        setPalace(p ?? null)
      } catch (e) {
        if (!alive) return
        setPalace(null)
        setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    })()
    return () => {
      alive = false
    }
  }, [palaceId])

  useEffect(() => {
    if (!palaceId) return
    destroyedRef.current = false
    offerRef.current = null
    roomPublishedRef.current = false
    roomAnswerAppliedRef.current = false
    setReceiverOnline(null)

    const peer: PeerInstance = new Peer({
      initiator: true,
      trickle: false,
      config: {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      },
    })
    peerRef.current = peer

    peer.on('signal', (data: SignalData) => {
      offerRef.current = data
      const text = safeJsonStringify(data)
      if (!text) {
        setPhase({ kind: 'error', message: '生成信令失败（JSON.stringify 失败）' })
        return
      }
      setPhase({ kind: 'offer', offerText: text, offerQr: null })
    })

    peer.on('connect', () => {
      void startSend(peer)
    })

    peer.on('error', (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      setPhase({ kind: 'error', message: msg })
    })

    peer.on('close', () => {
      if (destroyedRef.current) return
      const p = phaseRef.current
      // If user navigates away mid-transfer.
      if (p.kind !== 'done' && p.kind !== 'error') {
        setPhase({ kind: 'error', message: '连接已关闭' })
      }
    })

    return () => {
      destroyedRef.current = true
      try {
        peer.destroy()
      } catch {
        // ignore
      }
      peerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palaceId])

  useEffect(() => {
    let alive = true
    if (!offerText) return
    void (async () => {
      try {
        const url = await QRCode.toDataURL(offerText, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
        if (!alive) return
        setPhase((prev) => {
          if (prev.kind !== 'offer' && prev.kind !== 'connecting') return prev
          if (prev.offerText !== offerText) return prev
          return { ...prev, offerQr: url }
        })
      } catch {
        // best-effort; ignore
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerText])

  function closeRoomSocket() {
    wsRef.current?.close()
    wsRef.current = null
    setRoomBusy(null)
    setReceiverOnline(null)
    roomPublishedRef.current = false
  }

  function publishOfferOverRoom() {
    const peer = peerRef.current
    const offer = offerRef.current
    if (!peer || !offer) {
      setRoomError('Offer 尚未生成，请稍后再试')
      return
    }

    const url = normalizeSignalUrl(signalUrlDraft)
    if (!url) {
      setRoomError('信令地址无效：请输入 ws:// 或 wss://（也支持 http(s):// 自动转换）')
      return
    }

    closeRoomSocket()
    writeSignalUrl(url)
    setSignalUrlDraft(url)
    setRoomError(null)
    setRoomBusy('连接信令服务器中…')
    setReceiverOnline(null)
    roomPublishedRef.current = false

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setRoomBusy('加入房间中…')
      ws.send(JSON.stringify({ type: 'join', room: roomCode, role: 'sender' }))
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

      if (msg.type === 'peer' && msg.room === roomCode && msg.role === 'receiver') {
        setReceiverOnline(msg.online)
      }

      if (msg.type === 'joined' && msg.room === roomCode && msg.role === 'sender') {
        ws.send(JSON.stringify({ type: 'signal', room: roomCode, role: 'sender', data: offer }))
        roomPublishedRef.current = true
        setRoomBusy('已发布 Offer，等待接收方…')
      }

      if (msg.type === 'signal' && msg.room === roomCode && msg.role === 'receiver') {
        const answer = msg.data
        if (!isSignalData(answer)) return
        if (roomAnswerAppliedRef.current) return
        roomAnswerAppliedRef.current = true
        try {
          peer.signal(answer)
          setRoomBusy('已收到 Answer，连接中…')
        } catch {
          setRoomBusy(null)
          setRoomError('应用 Answer 失败')
        }
      }
    }
  }

  async function startSend(peer: PeerInstance) {
    if (!palaceId) return
    setPhase({ kind: 'sending', sent: 0, total: 1 })
    try {
      const p = await getPalace(palaceId)
      if (!p) throw new Error('宫殿不存在或已删除')
      const cards = await getCards(palaceId)
      const blobIds = Array.from(new Set(cards.flatMap((c) => (c.modelId ? [...c.imageIds, c.modelId] : c.imageIds))))
      const blobs = await getBlobs(blobIds)
      const { fileName, blob } = await buildMpFileV1({ palace: p, cards, blobs })
      const buf = await blob.arrayBuffer()

      const total = buf.byteLength
      setPhase({ kind: 'sending', sent: 0, total })

      peer.send(JSON.stringify({ type: 'mpalace', fileName, byteLength: total }))

      const CHUNK = 64 * 1024
      let sent = 0
      while (sent < total) {
        const end = Math.min(total, sent + CHUNK)
        peer.send(buf.slice(sent, end))
        sent = end
        setPhase({ kind: 'sending', sent, total })
        // Yield to keep UI responsive.
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      }

      setPhase({ kind: 'done' })
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  function onApplyAnswer() {
    const peer = peerRef.current
    if (!peer) return
    try {
      const data = parseSignal(answerText)
      setPhase((prev) => (prev.kind === 'offer' ? { kind: 'connecting', offerText: prev.offerText, offerQr: prev.offerQr } : prev))
      if (!roomAnswerAppliedRef.current) roomAnswerAppliedRef.current = true
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

  if (!palaceId) {
    return (
      <div className="page">
        <header className="page__header">
          <h1 className="page__title">扫码传输（发送）</h1>
        </header>
        <main className="page__body">
          <p className="hint danger-text">缺少 palaceId 参数</p>
          <Link className="btn" to="/">
            返回首页
          </Link>
        </main>
      </div>
    )
  }

  if (!palace) {
    return (
      <div className="page">
        <header className="page__header">
          <h1 className="page__title">扫码传输（发送）</h1>
          <p className="hint">宫殿：{palaceId}</p>
        </header>
        <main className="page__body">
          {phase.kind === 'error' ? <p className="hint danger-text">{phase.message}</p> : <p className="hint">加载中…</p>}
          <Link className="btn" to="/">
            返回首页
          </Link>
        </main>
      </div>
    )
  }

  const sending = phase.kind === 'sending'
  const progress = sending && phase.total > 0 ? Math.max(0, Math.min(1, phase.sent / phase.total)) : 0

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">扫码传输（发送）</h1>
        <p className="hint">
          宫殿：{palace.title} · {palace.templateId}
        </p>
      </header>

      <main className="page__body">
        <section className="cardbox">
          <h2 className="cardbox__title">房间码（推荐 Quest）</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            需要在同一台电脑/服务器上运行信令服务：在本项目目录执行 `npm run signal`，默认端口 8787。
          </p>
          <label className="field">
            <span className="field__label">信令地址</span>
            <input className="field__input" value={signalUrlDraft} onChange={(e) => setSignalUrlDraft(e.target.value)} />
          </label>
          <div className="row">
            <button className="btn primary" onClick={publishOfferOverRoom} disabled={!offerRef.current || sending || phase.kind === 'done'}>
              {roomPublishedRef.current ? '重连房间' : '启动房间'}
            </button>
            <button
              className="btn"
              onClick={() => {
                setRoomCode(newRoomCode())
                closeRoomSocket()
                setRoomError(null)
                setRoomBusy(null)
                roomAnswerAppliedRef.current = false
              }}
              disabled={sending || phase.kind === 'done'}
            >
              换一个房间码
            </button>
            <button className="btn" onClick={() => void onCopy(roomCode)} disabled={!roomCode}>
              复制房间码
            </button>
          </div>
          <div className="row">
            <span className="chip">房间码：{roomCode}</span>
            <span className="hint" style={{ margin: 0 }}>
              接收方在「扫码接收」页输入该码即可
            </span>
          </div>
          {receiverOnline !== null ? (
            <p className="hint" style={{ marginTop: 8 }}>
              接收方：{receiverOnline ? '已加入' : '未加入'}
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
          <h2 className="cardbox__title">1) 把此“Offer”给接收方</h2>
          {offerText ? (
            <div className="qr">
              {offerQr ? <img className="qr__img" src={offerQr} alt="Offer QR" /> : <p className="hint">生成二维码中…</p>}
              <div className="row">
                <button className="btn" onClick={() => void onCopy(offerText)} disabled={!offerText}>
                  复制 Offer
                </button>
              </div>
              <textarea className="textarea textarea--small" value={offerText} readOnly />
            </div>
          ) : (
            <p className="hint">正在生成 Offer…</p>
          )}
          <p className="hint">接收方会用 Offer 生成 “Answer”。</p>
        </section>

        <section className="cardbox">
          <h2 className="cardbox__title">2) 填入接收方的 “Answer”</h2>
          <div className="row">
            <button className="btn" onClick={() => setScanAnswer((v) => !v)}>
              {scanAnswer ? '关闭扫码' : '相机扫码'}
            </button>
            <button className="btn primary" onClick={onApplyAnswer} disabled={!answerText.trim() || sending || phase.kind === 'done'}>
              连接
            </button>
          </div>
          {scanAnswer ? (
            <QrScanner
              active={scanAnswer}
              onText={(text) => {
                setAnswerText(text)
                setScanAnswer(false)
              }}
              onError={(m) => setPhase({ kind: 'error', message: m })}
            />
          ) : null}
          <textarea
            className="textarea textarea--small"
            placeholder="粘贴 Answer（JSON）"
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
          />
          <p className="hint">若两台设备不支持扫码，可用复制/粘贴交换文本。</p>
        </section>

        <section className="cardbox">
          <h2 className="cardbox__title">传输状态</h2>
          {phase.kind === 'connecting' ? <p className="hint">连接中…</p> : null}
          {sending ? (
            <>
              <div className="progress">
                <div className="progress__bar">
                  <div className="progress__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <p className="hint" style={{ marginTop: 8 }}>
                  已发送 {formatBytes(phase.sent)} / {formatBytes(phase.total)}
                </p>
              </div>
            </>
          ) : null}
          {phase.kind === 'done' ? <p className="hint">发送完成。</p> : null}
          {phase.kind === 'error' ? <p className="hint danger-text">{phase.message}</p> : null}
          <div className="row">
            <button
              className="btn"
              onClick={() => {
                try {
                  peerRef.current?.destroy()
                } catch {
                  // ignore
                }
                navigate('/')
              }}
            >
              结束并返回
            </button>
            <Link className="btn" to={`/palace/${palaceId}/map`}>
              返回地图
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}

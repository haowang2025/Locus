import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { clearCustomMap, getBlob, getCards, getCard, getPalace, nowIso, setCustomMapFromFile, upsertCard } from '../lib/db'
import { LOCUS_COUNT, routeIndexFromLocusId } from '../lib/loci'
import { type Confidence, computeNextReviewAtIso } from '../lib/review'
import { bumpReviewStats, clearActiveReviewSession, readActiveReviewSession, writeActiveReviewSession, writeLastReviewSummary } from '../lib/reviewSession'
import { markGlobalStudiedNow } from '../lib/streak'
import type { CardRecord, LocusId, PalaceRecord } from '../lib/types'
import CardModal from '../ui/CardModal'
import Joystick from '../ui/Joystick'
import LocusDrawer from '../ui/LocusDrawer'
import MapHud from '../ui/MapHud'
import PromptHud from '../ui/PromptHud'
import TrainPanel from '../ui/TrainPanel'
import { FpsWorld } from '../three/FpsWorld'
import type { ReviewSessionV1 } from '../lib/reviewSession'

type PromptHudMode = 'off' | 'compact' | 'full'
const PROMPT_HUD_MODE_KEY = 'mpalace_promptHudMode'

function readPromptHudMode(): PromptHudMode {
  try {
    const v = window.localStorage.getItem(PROMPT_HUD_MODE_KEY)
    if (v === 'off' || v === 'compact' || v === 'full') return v
  } catch {
    // ignore
  }
  return 'compact'
}

function isFilled(card: CardRecord) {
  return Boolean(card.prompt.trim() || card.answer.trim() || card.note?.trim() || card.imageIds.length > 0 || card.modelId)
}

function emptyCard(palaceId: string, locusId: LocusId, routeIndex: number): CardRecord {
  return {
    palaceId,
    locusId,
    routeIndex,
    prompt: '',
    answer: '',
    note: undefined,
    imageIds: [],
    modelId: undefined,
    modelScale: undefined,
    confidence: undefined,
    lastReviewedAt: undefined,
    reviewCount: undefined,
    nextReviewAt: undefined,
    revealedCount: 0,
    updatedAt: nowIso(),
  }
}

export default function MapPage() {
  const { palaceId } = useParams<{ palaceId: string }>()
  const navigate = useNavigate()
  const [cards, setCards] = useState<CardRecord[]>([])
  const [palace, setPalace] = useState<PalaceRecord | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [openCard, setOpenCard] = useState<{ locusId: LocusId; card: CardRecord } | null>(null)
  const [nearLocusId, setNearLocusId] = useState<LocusId | null>(null)
  const [run, setRun] = useState(false)
  const [mode, setMode] = useState<'explore' | 'train'>('train')
  const [worldEpoch, setWorldEpoch] = useState(0)
  const [promptHudMode, setPromptHudMode] = useState<PromptHudMode>(() => readPromptHudMode())
  const [isPortrait, setIsPortrait] = useState(() => window.innerWidth < window.innerHeight)
  const [train, setTrain] = useState<{ locusId: LocusId; stage: 'front' | 'back'; card: CardRecord } | null>(null)
  const [hudLocusId, setHudLocusId] = useState<LocusId | null>(null)
  const [moving, setMoving] = useState(false)
  const [mapBusy, setMapBusy] = useState<string | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [vrSupported, setVrSupported] = useState<boolean | null>(null)
  const [vrActive, setVrActive] = useState(false)
  const [vrUiError, setVrUiError] = useState<string | null>(null)
  const [reviewSession, setReviewSession] = useState<ReviewSessionV1 | null>(null)
  const [ratingBusy, setRatingBusy] = useState(false)

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<FpsWorld | null>(null)
  const modeRef = useRef(mode)
  const byIdRef = useRef<Map<LocusId, CardRecord>>(new Map())
  const modelByLocusRef = useRef<Map<LocusId, { id: string; scale: number }>>(new Map())
  const modelLoadSeqRef = useRef(0)
  const nearRef = useRef<LocusId | null>(nearLocusId)
  const openCardRef = useRef(openCard)
  const trainRef = useRef(train)
  const movingRef = useRef(false)
  const reviewSessionRef = useRef<ReviewSessionV1 | null>(reviewSession)
  const ratingBusyRef = useRef(ratingBusy)

  useEffect(() => {
    try {
      window.localStorage.setItem(PROMPT_HUD_MODE_KEY, promptHudMode)
    } catch {
      // ignore
    }
  }, [promptHudMode])

  async function reload() {
    if (!palaceId) return
    const all = await getCards(palaceId)
    setCards(all)
  }

  useEffect(() => {
    void reload()
  }, [palaceId])

  async function reloadPalace() {
    if (!palaceId) return
    const p = await getPalace(palaceId)
    setPalace(p ?? null)
  }

  useEffect(() => {
    void reloadPalace()
  }, [palaceId])

  const byId = useMemo(() => new Map(cards.map((c) => [c.locusId, c] as const)), [cards])
  const filledLoci = useMemo(() => {
    const filled = new Set<LocusId>()
    for (const c of cards) {
      if (isFilled(c)) filled.add(c.locusId)
    }
    return filled
  }, [cards])
  const filledCount = filledLoci.size

  useEffect(() => {
    byIdRef.current = byId
  }, [byId])

  useEffect(() => {
    nearRef.current = nearLocusId
  }, [nearLocusId])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    openCardRef.current = openCard
  }, [openCard])

  useEffect(() => {
    trainRef.current = train
  }, [train])

  useEffect(() => {
    reviewSessionRef.current = reviewSession
  }, [reviewSession])

  useEffect(() => {
    ratingBusyRef.current = ratingBusy
  }, [ratingBusy])

  useEffect(() => {
    if (!palaceId) {
      setReviewSession(null)
      return
    }
    const session = readActiveReviewSession()
    if (session && session.palaceId === palaceId && session.queue.length > 0 && session.index < session.queue.length) {
      setReviewSession(session)
      return
    }
    setReviewSession(null)
  }, [palaceId])

  useEffect(() => {
    if (!reviewSession) return
    setMode('train')
    setOpenCard(null)
    setDrawerOpen(false)
  }, [reviewSession])

  useEffect(() => {
    if (!vrActive) return
    setOpenCard(null)
    setDrawerOpen(false)
  }, [vrActive])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        if (!('xr' in navigator) || !navigator.xr || typeof navigator.xr.isSessionSupported !== 'function') {
          if (alive) setVrSupported(false)
          return
        }
        const ok = await navigator.xr.isSessionSupported('immersive-vr')
        if (alive) setVrSupported(ok)
      } catch {
        if (alive) setVrSupported(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  async function enterVr() {
    setVrUiError(null)
    try {
      await worldRef.current?.enterVr({ domOverlayRoot: rootRef.current ?? document.body })
    } catch (err) {
      setVrUiError(err instanceof Error ? err.message : String(err))
    }
  }

  async function exitVr() {
    setVrUiError(null)
    try {
      await worldRef.current?.exitVr()
    } catch (err) {
      setVrUiError(err instanceof Error ? err.message : String(err))
    }
  }

  async function openLocus(locusId: LocusId, routeIndex: number) {
    if (!palaceId) return
    const existing = (await getCard(palaceId, locusId)) ?? byId.get(locusId)
    worldRef.current?.teleportTo(locusId)
    const card = existing ?? emptyCard(palaceId, locusId, routeIndex)
    if (mode === 'train') {
      setTrain({ locusId, stage: 'front', card })
    } else {
      setOpenCard({ locusId, card })
    }
  }

  function jumpToLocusFromDrawer(locusId: LocusId) {
    setDrawerOpen(false)
    setTrain(null)
    setOpenCard(null)
    worldRef.current?.teleportNearAndAim(locusId)
  }

  async function onImportCustomMap(file: File) {
    if (!palaceId) return
    setMapError(null)
    setMapBusy('解析并加载中…')
    try {
      const world = worldRef.current
      if (!world) throw new Error('3D 引擎未就绪，请稍后重试')
      await world.loadCustomMapFromBlob(file)
      setMapBusy('保存到本地中…')
      await setCustomMapFromFile(palaceId, file)
      await reloadPalace()
    } catch (err) {
      setMapError(err instanceof Error ? err.message : String(err))
    } finally {
      setMapBusy(null)
    }
  }

  async function onClearCustomMapData() {
    if (!palaceId) return
    setMapError(null)
    setMapBusy('清除中…')
    try {
      await clearCustomMap(palaceId)
      await reloadPalace()
      worldRef.current?.clearCustomMap()
    } catch (err) {
      setMapError(err instanceof Error ? err.message : String(err))
    } finally {
      setMapBusy(null)
    }
  }

  useEffect(() => {
    function onResize() {
      setIsPortrait(window.innerWidth < window.innerHeight)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    if (!palaceId) return
    let alive = true
    const world = new FpsWorld({
      container: el,
      onNearChange: setNearLocusId,
      onVrChange: (active) => {
        if (!alive) return
        setVrActive(active)
        setVrUiError(null)
      },
      onInteract: () => {
        if (!alive) return
        void handleFire()
      },
    })
    worldRef.current = world
    setWorldEpoch((v) => v + 1)
    world.start()

    void (async () => {
      try {
        const p = await getPalace(palaceId)
        if (!alive) return
        if (!p) {
          setMapError('宫殿不存在或已删除')
          return
        }
        // Always load built-in Dust2 first so "清除自定义地图" can reliably fall back to it.
        setMapError(null)
        setMapBusy('加载内置 Dust2（GLB）中…')
        try {
          await world.loadBuiltinDust2Glb()
        } catch (errGlb) {
          console.warn('loadBuiltinDust2Glb failed, falling back to OBJ.', errGlb)
          setMapBusy('GLB 加载失败，回退到内置 OBJ…')
          try {
            await world.loadBuiltinDust2Obj()
          } catch (errObj) {
            setMapError(errObj instanceof Error ? errObj.message : String(errObj))
          }
        }

        if (!p.customMap) return

        const blob = await getBlob(p.customMap.blobId)
        if (!alive) return
        if (!blob) {
          setMapError('已保存的自定义地图文件丢失，请重新导入')
          return
        }
        setMapError(null)
        setMapBusy('加载自定义地图中…')
        await world.loadCustomMapFromBlob(blob.data)
      } catch (err) {
        if (!alive) return
        setMapError(err instanceof Error ? err.message : String(err))
      } finally {
        if (alive) setMapBusy(null)
      }
    })()

    return () => {
      alive = false
      world.dispose()
      worldRef.current = null
      setWorldEpoch((v) => v + 1)
    }
  }, [palaceId])

  useEffect(() => {
    worldRef.current?.setRunToggled(run)
  }, [run])

  useEffect(() => {
    worldRef.current?.setFilledLoci(filledLoci)
  }, [filledLoci])

  useEffect(() => {
    const world = worldRef.current
    if (!world) return

    if (!vrActive) {
      world.hideVrCard()
      return
    }

    if (!train) {
      world.hideVrCard()
      return
    }

    const prompt = train.card.prompt.trim()
    const answer = train.card.answer.trim()
    const note = train.card.note?.trim()

    const session = reviewSession && palaceId && reviewSession.palaceId === palaceId ? reviewSession : null
    if (session) {
      const progress = `${Math.min(session.queue.length, session.index + 1)}/${session.queue.length}`
      const title = `${train.locusId} · ${progress}`

      if (train.stage === 'front') {
        world.showVrCardUi({
          title,
          body: `${prompt || '（空）'}\n\n看向按钮并右手捏合确认。`,
          buttons: [
            { id: 'reveal', label: '显示答案', tone: 'primary' },
            { id: 'exit', label: '退出复习' },
          ],
        })
        return
      }

      const parts = [
        prompt || '（空）',
        '',
        answer || '（空）',
        note ? `\nNote:\n${note}` : '',
        ratingBusy ? '\n\n保存中…' : '\n\n请选择：没记住 / 模糊 / 记住了',
      ].filter(Boolean)

      world.showVrCardUi({
        title,
        body: parts.join('\n'),
        buttons: [
          { id: 'rate0', label: '没记住', tone: 'danger' },
          { id: 'rate1', label: '模糊' },
          { id: 'rate2', label: '记住了', tone: 'primary' },
          { id: 'exit', label: '退出复习' },
        ],
      })
      return
    }

    if (train.stage === 'front') {
      world.showVrCard(`${train.locusId}\n${prompt || '（空）'}`)
      return
    }

    const tail = [answer || '（空）', note ? `\nNote:\n${note}` : ''].filter(Boolean).join('\n')
    world.showVrCard(`${train.locusId}\n${prompt || '（空）'}\n\n${tail}`)
  }, [train, vrActive, reviewSession, ratingBusy, palaceId])

  useEffect(() => {
    if (!palaceId) return
    const world = worldRef.current
    if (!world) return

    const desired = new Map<LocusId, { id: string; scale: number }>()
    for (const c of cards) {
      if (!c.modelId) continue
      desired.set(c.locusId, { id: c.modelId, scale: c.modelScale ?? 1 })
    }

    const prev = modelByLocusRef.current

    for (const locusId of Array.from(prev.keys())) {
      if (!desired.has(locusId)) {
        world.clearLocusModel(locusId)
        prev.delete(locusId)
      }
    }

    let cancelled = false
    const seq = modelLoadSeqRef.current + 1
    modelLoadSeqRef.current = seq

    void (async () => {
      for (const [locusId, next] of desired.entries()) {
        if (cancelled || modelLoadSeqRef.current !== seq) return
        const existing = prev.get(locusId)
        if (existing && existing.id === next.id && Math.abs(existing.scale - next.scale) < 1e-3) continue

        const blobRecord = await getBlob(next.id)
        if (cancelled || modelLoadSeqRef.current !== seq) return
        if (!blobRecord) {
          world.clearLocusModel(locusId)
          prev.delete(locusId)
          continue
        }

        try {
          await world.setLocusModel(locusId, blobRecord.data, next.scale)
          if (cancelled || modelLoadSeqRef.current !== seq) return
          prev.set(locusId, next)
        } catch {
          // best-effort; ignore
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [cards, palaceId])

  useEffect(() => {
    if (!reviewSession) return
    if (!palaceId || reviewSession.palaceId !== palaceId) return
    const locusId = reviewSession.queue[reviewSession.index]
    if (!locusId) return
    const world = worldRef.current
    if (!world) return

    const current = trainRef.current
    if (current && current.locusId === locusId && current.stage === 'front') return

    void (async () => {
      const card = await resolveCard(locusId)
      world.teleportNearAndAim(locusId)
      setTrain({ locusId, stage: 'front', card })
    })()
  }, [reviewSession?.id, reviewSession?.index, palaceId, worldEpoch])

  useEffect(() => {
    if (openCard) return
    const session = reviewSessionRef.current
    if (!session) return
    if (!palaceId || session.palaceId !== palaceId) return
    if (trainRef.current) return
    const locusId = session.queue[session.index]
    if (!locusId) return
    const world = worldRef.current
    if (!world) return
    void (async () => {
      const card = await resolveCard(locusId)
      world.teleportNearAndAim(locusId)
      setTrain({ locusId, stage: 'front', card })
    })()
  }, [openCard, palaceId, worldEpoch])

  async function resolveCard(locusId: LocusId): Promise<CardRecord> {
    if (!palaceId) {
      const idx = routeIndexFromLocusId(locusId) ?? 1
      return emptyCard('missing', locusId, idx)
    }
    const idx = routeIndexFromLocusId(locusId) ?? 1
    const existing = (await getCard(palaceId, locusId)) ?? byIdRef.current.get(locusId)
    return existing ?? emptyCard(palaceId, locusId, idx)
  }

  async function exitReview() {
    clearActiveReviewSession()
    setReviewSession(null)
    setTrain(null)
  }

  async function onRate(confidence: Confidence) {
    if (!palaceId) return
    const session = reviewSessionRef.current
    if (!session) return
    const current = trainRef.current
    if (!current) return
    if (ratingBusyRef.current) return
    ratingBusyRef.current = true
    setRatingBusy(true)
    try {
      const locusId = current.locusId
      const existing = await resolveCard(locusId)
      const now = new Date()
      const reviewedAt = now.toISOString()

      const next: CardRecord = {
        ...existing,
        confidence,
        lastReviewedAt: reviewedAt,
        reviewCount: (existing.reviewCount ?? 0) + 1,
        nextReviewAt: computeNextReviewAtIso(now, confidence),
        updatedAt: reviewedAt,
      }

      await upsertCard(next)
      markGlobalStudiedNow(now)
      await reload()

      const nextStats = bumpReviewStats(session.stats, confidence)
      const nextIndex = session.index + 1

      if (nextIndex >= session.queue.length) {
        writeLastReviewSummary({
          version: 1,
          sessionId: session.id,
          kind: session.kind,
          palaceId: session.palaceId,
          startedAt: session.startedAt,
          finishedAt: reviewedAt,
          stats: nextStats,
        })
        clearActiveReviewSession()
        setReviewSession(null)
        setTrain(null)
        navigate('/review/summary')
        return
      }

      const nextSession: ReviewSessionV1 = { ...session, index: nextIndex, stats: nextStats }
      writeActiveReviewSession(nextSession)
      setReviewSession(nextSession)
    } finally {
      ratingBusyRef.current = false
      setRatingBusy(false)
    }
  }

  async function handleFire() {
    if (openCardRef.current) return
    if (!palaceId) return

    const world = worldRef.current
    if (!world) return

    const session = reviewSessionRef.current
    if (session && session.palaceId === palaceId) {
      if (world.isVrPresenting()) {
        const action = world.getVrUiHoveredAction()
        if (!action) return
        if (action === 'exit') {
          await exitReview()
          return
        }
        if (action === 'reveal') {
          if (trainRef.current?.stage === 'front') await onRevealAnswer()
          return
        }
        if (action === 'rate0') {
          world.playHitFeedback()
          void onRate(0)
          return
        }
        if (action === 'rate1') {
          world.playHitFeedback()
          void onRate(1)
          return
        }
        if (action === 'rate2') {
          world.playHitFeedback()
          void onRate(2)
          return
        }
        return
      }

      // Review mode in non-VR uses the on-screen panel.
      return
    }

    const hit = world.fire()
    if (hit) world.playHitFeedback()
    const locusId = hit ?? nearRef.current
    if (!locusId) return

    const card = await resolveCard(locusId)

    if (world.isVrPresenting()) {
      const current = trainRef.current
      if (!current || current.locusId !== locusId) {
        setTrain({ locusId, stage: 'front', card })
        return
      }

      if (current.stage === 'front') {
        const existing = await resolveCard(locusId)
        const next: CardRecord = {
          ...existing,
          revealedCount: (existing.revealedCount ?? 0) + 1,
          updatedAt: nowIso(),
        }
        await upsertCard(next)
        world.playRevealFeedback()
        await reload()
        setTrain({ locusId, stage: 'back', card: next })
        return
      }

      setTrain(null)
      return
    }

    const currentMode = modeRef.current

    if (currentMode === 'explore') {
      const idx = routeIndexFromLocusId(locusId) ?? card.routeIndex
      await openLocus(locusId, idx)
      return
    }

    setTrain({ locusId, stage: 'front', card })
  }

  async function onRevealAnswer() {
    if (!palaceId) return
    const current = trainRef.current
    if (!current) return
    if (current.stage !== 'front') return
    const existing = await resolveCard(current.locusId)
    const next: CardRecord = {
      ...existing,
      revealedCount: (existing.revealedCount ?? 0) + 1,
      updatedAt: nowIso(),
    }
    await upsertCard(next)
    worldRef.current?.playRevealFeedback()
    await reload()
    setTrain({ locusId: current.locusId, stage: 'back', card: next })
  }

  function onEditFromTrain() {
    if (!train) return
    const idx = routeIndexFromLocusId(train.locusId) ?? train.card.routeIndex
    setTrain(null)
    if (!palaceId) return
    setOpenCard({ locusId: train.locusId, card: train.card ?? emptyCard(palaceId, train.locusId, idx) })
  }

  const nearCard = nearLocusId ? byId.get(nearLocusId) : null
  const nearPrompt = nearCard?.prompt?.trim()
  const hudCard = hudLocusId ? byId.get(hudLocusId) : null
  const hudPrompt = hudCard?.prompt?.trim()

  useEffect(() => {
    if (mode !== 'train' || promptHudMode === 'off' || train) {
      setHudLocusId(null)
      return
    }
    if (!nearLocusId || !nearPrompt || moving) {
      setHudLocusId(null)
      return
    }

    const t = window.setTimeout(() => {
      setHudLocusId(nearLocusId)
    }, 380)
    return () => window.clearTimeout(t)
  }, [mode, promptHudMode, train, nearLocusId, nearPrompt, moving])

  return (
    <div className="page page--full">
      <div className="map-root" ref={rootRef}>
        <div className="map-canvas" ref={canvasRef} />

        <LocusDrawer
          open={drawerOpen}
          palace={palace}
          promptHudMode={promptHudMode}
          onPromptHudModeChange={(next) => setPromptHudMode(next)}
          mapBusy={mapBusy}
          mapError={mapError}
          filledLoci={filledLoci}
          onImportGlb={(file) => void onImportCustomMap(file)}
          onClearCustomMap={() => void onClearCustomMapData()}
          onJumpToLocus={jumpToLocusFromDrawer}
          onClose={() => setDrawerOpen(false)}
        />

        <MapHud
          vrSupported={vrSupported}
          vrActive={vrActive}
          vrUiError={vrUiError}
          filledCount={filledCount}
          locusCount={LOCUS_COUNT}
          run={run}
          mode={mode}
          modeToggleDisabled={reviewSession !== null}
          onEnterVr={() => void enterVr()}
          onExitVr={() => void exitVr()}
          onOpenDrawer={() => setDrawerOpen(true)}
          onToggleRun={() => setRun((v) => !v)}
          onToggleMode={() => setMode((m) => (m === 'train' ? 'explore' : 'train'))}
        />

        <div className="crosshair" aria-hidden="true" />

        {mode === 'train' && promptHudMode !== 'off' && hudLocusId && hudPrompt ? (
          <PromptHud locusId={hudLocusId} text={hudPrompt} mode={promptHudMode} />
        ) : null}

        {!vrActive ? (
          <>
            <Joystick
              className="joystick"
              onMove={(vec) => {
                worldRef.current?.setMoveVector(vec.x, vec.y)
                const next = Math.hypot(vec.x, vec.y) > 0.12
                if (next !== movingRef.current) {
                  movingRef.current = next
                  setMoving(next)
                }
              }}
            />

            {reviewSession === null ? (
              <button className="fire-btn" onClick={() => void handleFire()}>
                射击
              </button>
            ) : null}
          </>
        ) : null}

        {mode === 'train' && train && !vrActive ? (
          <TrainPanel
            locusId={train.locusId}
            card={train.card}
            stage={train.stage}
            progress={reviewSession ? { current: reviewSession.index + 1, total: reviewSession.queue.length } : null}
            showRating={reviewSession !== null}
            ratingBusy={ratingBusy}
            onRate={reviewSession ? (c) => void onRate(c) : undefined}
            onReveal={() => void onRevealAnswer()}
            onEdit={onEditFromTrain}
            onClose={() => {
              if (reviewSession) void exitReview()
              else setTrain(null)
            }}
          />
        ) : null}
      </div>

      {isPortrait ? (
        <div className="rotate-overlay">
          <div className="rotate-overlay__panel">
            <div className="rotate-overlay__title">请横屏使用 3D 地图</div>
            <p className="hint">建议在横屏下进入沉浸式 FPS 探索。</p>
            <p className="hint">
              <Link to="/">返回首页</Link>
            </p>
          </div>
        </div>
      ) : null}

      {openCard && !vrActive ? (
        <CardModal
          locusId={openCard.locusId}
          initialCard={openCard.card}
          onClose={() => setOpenCard(null)}
          onSaved={() => void reload()}
        />
      ) : null}
    </div>
  )
}

import { attachmentRole, visibleAttachmentIds } from '../lib/attachmentBindings'
import { useCallback, useEffectEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { clearCustomMap, getBlob, getBlobs, getCards, getCard, getPalace, nowIso, setCustomMapFromFile, upsertCard } from '../lib/db'
import { recordUnitRating, recordUnitReveal, semanticRecallView } from '../lib/palaceRecall'
import { LOCUS_COUNT, routeIndexFromLocusId } from '../lib/loci'
import { getSceneDefinition, type SceneDefinition, type SceneId } from '../lib/sceneRegistry'
import { validatePlan } from '../lib/palaceValidation'
import { type Confidence, buildReviewQueue, computeNextReviewAtIso } from '../lib/review'
import { newId } from '../lib/id'
import { defaultReviewStats, isReviewSessionCompatible, reviewPlanFingerprint, bumpReviewStats, clearActiveReviewSession, readActiveReviewSession, writeActiveReviewSession, writeLastReviewSummary } from '../lib/reviewSession'
import { markGlobalStudiedNow } from '../lib/streak'
import type { CardRecord, LocusId, PalaceRecord } from '../lib/types'
import CardModal from '../ui/CardModal'
import Joystick from '../ui/Joystick'
import LocusDrawer from '../ui/LocusDrawer'
import MapHud from '../ui/MapHud'
import PromptHud from '../ui/PromptHud'
import TrainPanel from '../ui/TrainPanel'
import { FpsWorld } from '../three/FpsWorld'
import ExportOfflineButton from '../ui/ExportOfflineButton'
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
  const [activeScene, setActiveScene] = useState<SceneDefinition | null>(null)
  const [palace, setPalace] = useState<PalaceRecord | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [openCard, setOpenCard] = useState<{ locusId: LocusId; card: CardRecord; attachmentsOnly?: boolean } | null>(null)
  const [nearLocusId, setNearLocusId] = useState<LocusId | null>(null)
  const [run, setRun] = useState(false)
  const [mode, setMode] = useState<'explore' | 'train'>('train')
  const [worldEpoch, setWorldEpoch] = useState(0)
  const [sceneImage, setSceneImage] = useState<{ key: string; id: string } | null>(null)
  const [promptHudMode, setPromptHudMode] = useState<PromptHudMode>(() => readPromptHudMode())
  const [isPortrait, setIsPortrait] = useState(() => window.innerWidth < window.innerHeight)
  const [train, setTrain] = useState<{ locusId: LocusId; stage: 'front' | 'back'; card: CardRecord; unitId?: string } | null>(null)
  const [hudLocusId, setHudLocusId] = useState<LocusId | null>(null)
  const [moving, setMoving] = useState(false)
  const [mapBusy, setMapBusy] = useState<string | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [vrSupported, setVrSupported] = useState<boolean | null>(null)
  const [vrActive, setVrActive] = useState(false)
  const [vrUiError, setVrUiError] = useState<string | null>(null)
  const [reviewSession, setReviewSession] = useState<ReviewSessionV1 | null>(null)
  const [ratingBusy, setRatingBusy] = useState(false)
  const [practiceNotice, setPracticeNotice] = useState('')
  const [viewWarning, setViewWarning] = useState<string | null>(null)
  const [cardsLoadedFor, setCardsLoadedFor] = useState<string | null>(null)
  const [attachmentChoice, setAttachmentChoice] = useState<string | null>(null)

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
  const currentPalaceRef = useRef(palaceId)
  const routeEpochRef = useRef(0)
  useEffect(() => {
    currentPalaceRef.current = palaceId; const epoch = ++routeEpochRef.current
    setTrain(null); setOpenCard(null); setPracticeNotice(''); setAttachmentChoice(null); ratingBusyRef.current = false; setRatingBusy(false)
    return () => { routeEpochRef.current = epoch + 1 }
  }, [palaceId])

  useEffect(() => {
    try {
      window.localStorage.setItem(PROMPT_HUD_MODE_KEY, promptHudMode)
    } catch {
      // ignore
    }
  }, [promptHudMode])

  const reload = useCallback(async () => {
    if (!palaceId) return
    const epoch = routeEpochRef.current
    const all = await getCards(palaceId)
    if (epoch !== routeEpochRef.current || currentPalaceRef.current !== palaceId) return
    setCards(all); setCardsLoadedFor(palaceId)
  }, [palaceId])

  useEffect(() => {
    void reload()
  }, [reload])

  const reloadPalace = useCallback(async () => {
    if (!palaceId) return
    const epoch = routeEpochRef.current
    const p = await getPalace(palaceId)
    if (epoch !== routeEpochRef.current || currentPalaceRef.current !== palaceId) return
    setPalace(p ?? null)
    if (p?.mnemonicPlan) { try { setActiveScene(getSceneDefinition(p.mnemonicPlan.sceneId)) } catch { /* Show load error in the world loader. */ } }
  }, [palaceId])

  useEffect(() => {
    void reloadPalace()
  }, [reloadPalace])

  const planFingerprint = useMemo(() => palace?.mnemonicPlan ? reviewPlanFingerprint(palace.mnemonicPlan) : undefined, [palace?.mnemonicPlan])
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
    if (currentPalaceRef.current !== palaceId) return
    worldRef.current?.teleportTo(locusId)
    const card = existing ?? emptyCard(palaceId, locusId, routeIndex)
    if (mode === 'train') {
      setTrain({ locusId, stage: 'front', card })
    } else {
      if (card.mnemonic) { navigate(`/palace/${palaceId}/quick-import?anchor=${encodeURIComponent(card.mnemonic.anchorId)}`); return }
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

  const onWorldInteract = useEffectEvent(() => { void handleFire() })

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    if (!palaceId) return
    let alive = true
    let world: FpsWorld
    try { world = new FpsWorld({
      container: el,
      onNearChange: setNearLocusId,
      onViewWarning: setViewWarning,
      onVrChange: (active) => {
        if (!alive) return
        setVrActive(active)
        setVrUiError(null)
      },
      onInteract: () => {
        if (!alive) return
        onWorldInteract()
      },
    })
    } catch (error) {
      setMapError(`3D 场景无法启动：${error instanceof Error ? error.message : String(error)}。仍可使用文字点位和离线导出。`)
      return
    }
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
        setMapError(null)
        if (p.mnemonicPlan) {
          const sceneId = p.mnemonicPlan.sceneId as SceneId
          const definition = getSceneDefinition(sceneId)
          const issues = validatePlan(p.mnemonicPlan, definition, true)
          if (issues.length) throw new Error(`方案需要重新核对：${issues[0]!.message}`)
          setMapBusy(`加载${definition.title}…`)
          await world.loadBuiltinScene(sceneId)
          if (!alive) return
          setActiveScene(definition)
          world.setMnemonicCards(await getCards(palaceId))
          setWorldEpoch(v => v + 1)
        } else {
          setActiveScene(null)
          setMapBusy('加载内置 Dust2（GLB）中…')
          try {
            await world.loadBuiltinDust2Glb()
          } catch (errGlb) {
            console.warn('loadBuiltinDust2Glb failed, falling back to OBJ.', errGlb)
            setMapBusy('GLB 加载失败，回退到内置 OBJ…')
            await world.loadBuiltinDust2Obj()
          }
        }

        if (p.mnemonicPlan || !p.customMap) return

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
    worldRef.current?.setMnemonicCards(cards)
  }, [filledLoci, cards, worldEpoch])

  useEffect(() => {
    const unitId = mode === 'train' && train?.card.mnemonic
      ? train.unitId ?? train.card.mnemonic.unitIds[0] ?? null
      : null
    worldRef.current?.setMnemonicCueFocus(unitId)
  }, [mode, train, cards, worldEpoch])


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

    let semantic: ReturnType<typeof semanticRecallView> = null
    try { semantic = semanticRecallView(train.card, palace?.mnemonicPlan, train.unitId) } catch { world.showVrCard('复习单元已变化，请重新打开复习队列。'); return }
    if (train.card.mnemonic && !semantic) { world.showVrCard('正在读取含义单元…'); return }
    const prompt = semantic ? `回忆此处第 ${semantic.index + 1}/${semantic.total} 个含义单元。` : train.card.prompt.trim()
    const answer = semantic?.facts ?? train.card.answer.trim()
    const note = semantic?.cueText ?? train.card.note?.trim()

    const session = reviewSession && palaceId && reviewSession.palaceId === palaceId ? reviewSession : null
    if (session || semantic) {
      const progress = session ? `${Math.min(session.queue.length, session.index + 1)}/${session.queue.length}` : `单元 ${semantic!.index + 1}/${semantic!.total}`
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
  }, [train, vrActive, reviewSession, ratingBusy, palaceId, palace])

  useEffect(() => {
    const world = worldRef.current
    if (!world) return
    let cancelled = false
    world.clearAllLocusImages()
    void (async () => {
      for (const card of cards) {
        const current = train?.locusId === card.locusId
        const unitId = current ? train.unitId ?? card.mnemonic?.unitIds[0] : card.mnemonic?.unitIds[0]
        const visible = visibleAttachmentIds(card, unitId, mode !== 'train' || (current && train.stage === 'back'))
        if (!visible.imageIds.length) continue
        const key = `${card.locusId}:${unitId ?? ''}:${card.updatedAt}`
        if (sceneImage?.key === key && sceneImage.id === '__model__' && visible.modelId) continue
        const selected = sceneImage?.key === key && visible.imageIds.includes(sceneImage.id) ? sceneImage.id : visible.imageIds[0]
        const blobs = await getBlobs([selected])
        if (cancelled || worldRef.current !== world) return
        await world.setLocusImages(card.locusId, blobs.map(blob => ({ id: blob.id, blob: blob.data })), selected)
        if (cancelled) return
      }
    })().catch(error => { if (!cancelled) setPracticeNotice(`图片场景预览失败：${error instanceof Error ? error.message : String(error)}。原文件仍保留。`) })
    return () => { cancelled = true; world.clearAllLocusImages() }
  }, [cards, mode, train, worldEpoch, sceneImage])

  useEffect(() => {
    if (!palaceId) return
    const world = worldRef.current
    if (!world) return

    const desired = new Map<LocusId, { id: string; scale: number }>()
    for (const c of cards) {
      if (!c.modelId) continue
      const key = train ? `${train.locusId}:${train.unitId ?? train.card.mnemonic?.unitIds[0] ?? ''}:${train.card.updatedAt}` : ''
      const role = attachmentRole(c, c.modelId, train?.locusId === c.locusId ? train.unitId : c.mnemonic?.unitIds[0])
      if (role === null) continue
      if (mode === 'train' && role !== 'cue' && (train?.stage !== 'back' || train.locusId !== c.locusId || attachmentChoice !== key)) continue
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
  }, [cards, palaceId, mode, train, attachmentChoice, worldEpoch])

  const resolveCard = useCallback(async (locusId: LocusId): Promise<CardRecord> => {
    if (!palaceId) {
      const idx = routeIndexFromLocusId(locusId) ?? 1
      return emptyCard('missing', locusId, idx)
    }
    const idx = routeIndexFromLocusId(locusId) ?? 1
    const existing = (await getCard(palaceId, locusId)) ?? byIdRef.current.get(locusId)
    return existing ?? emptyCard(palaceId, locusId, idx)
  }, [palaceId])

  useEffect(() => {
    if (!reviewSession || !palace || !palaceId || palace.id !== palaceId || cardsLoadedFor !== palaceId) return
    if (isReviewSessionCompatible(reviewSession, cards, palace.mnemonicPlan, planFingerprint)) return
    const { queue, unitQueue } = buildReviewQueue(cards, new Date(), 10)
    if (!queue.length) { clearActiveReviewSession(); setReviewSession(null); setTrain(null); setPracticeNotice('原复习队列已失效，当前没有可复习单元。'); return }
    const refreshed: ReviewSessionV1 = { version: 1, id: newId('review'), kind: reviewSession.kind, palaceId: palaceId!, queue, unitQueue, index: 0, startedAt: nowIso(), stats: defaultReviewStats(), contentFingerprint: planFingerprint }
    writeActiveReviewSession(refreshed); setReviewSession(refreshed); setTrain(null); setPracticeNotice('材料或场景已变化，复习队列已按当前含义单元重新建立。')
  }, [reviewSession, cards, palace, palaceId, cardsLoadedFor, planFingerprint])

  useEffect(() => {
    if (!reviewSession) return
    if (!palaceId || reviewSession.palaceId !== palaceId || cardsLoadedFor !== palaceId || palace?.id !== palaceId || !isReviewSessionCompatible(reviewSession, cards, palace.mnemonicPlan, planFingerprint)) return
    const locusId = reviewSession.queue[reviewSession.index]
    if (!locusId) return
    const world = worldRef.current

    const current = trainRef.current
    if (current && current.locusId === locusId && current.unitId === (reviewSession.unitQueue?.[reviewSession.index] ?? undefined)) return

    let cancelled = false
    void (async () => {
      const card = await resolveCard(locusId)
      if (cancelled) return
      world?.teleportNearAndAim(locusId)
      setTrain({ locusId, stage: 'front', card, unitId: reviewSession.unitQueue?.[reviewSession.index] ?? undefined })
    })()
    return () => { cancelled = true }
  }, [reviewSession, palaceId, worldEpoch, cardsLoadedFor, palace, planFingerprint, cards, resolveCard])

  useEffect(() => {
    if (openCard) return
    const session = reviewSessionRef.current
    if (!session) return
    if (!palaceId || session.palaceId !== palaceId || cardsLoadedFor !== palaceId || palace?.id !== palaceId || !isReviewSessionCompatible(session, cards, palace.mnemonicPlan, planFingerprint)) return
    if (trainRef.current) return
    const locusId = session.queue[session.index]
    if (!locusId) return
    const world = worldRef.current
    let cancelled = false
    void (async () => {
      const card = await resolveCard(locusId)
      if (cancelled) return
      world?.teleportNearAndAim(locusId)
      setTrain({ locusId, stage: 'front', card, unitId: session.unitQueue?.[session.index] ?? undefined })
    })()
    return () => { cancelled = true }
  }, [openCard, palaceId, worldEpoch, cardsLoadedFor, palace, planFingerprint, cards, resolveCard])


  async function exitReview() {
    clearActiveReviewSession()
    setReviewSession(null)
    setTrain(null)
  }

  async function onRate(confidence: Confidence) {
    if (!palaceId) return
    const session = reviewSessionRef.current, current = trainRef.current
    if (!current || current.stage !== 'back' || (!session && !current.card.mnemonic) || ratingBusyRef.current) return
    ratingBusyRef.current = true; setRatingBusy(true); setMapError(null)
    const epoch = routeEpochRef.current
    try {
      const existing = await resolveCard(current.locusId), now = new Date(), reviewedAt = now.toISOString()
      const unitId = current.unitId ?? existing.mnemonic?.unitIds[0]
      const next: CardRecord = unitId && existing.mnemonic ? recordUnitRating(existing, unitId, confidence, now) : { ...existing, confidence, lastReviewedAt: reviewedAt, reviewCount: (existing.reviewCount ?? 0) + 1, nextReviewAt: computeNextReviewAtIso(now, confidence), updatedAt: reviewedAt }
      await upsertCard(next); markGlobalStudiedNow(now); if (epoch !== routeEpochRef.current) return; await reload()
      if (epoch !== routeEpochRef.current) return
      setPracticeNotice(unitId ? '已保存这个含义单元的评分，其他单元的评分未改变。' : '评分已保存。')
      const unitIndex = unitId ? next.mnemonic!.unitIds.indexOf(unitId) : -1
      if (session) {
        const nextStats = bumpReviewStats(session.stats, confidence)
        // Existing pre-upgrade sessions contain anchor IDs only: finish each unit before advancing.
        if (!session.unitQueue && next.mnemonic && unitIndex + 1 < next.mnemonic.unitIds.length) {
          const nextSession = { ...session, stats: nextStats }; writeActiveReviewSession(nextSession); setReviewSession(nextSession)
          setTrain({ locusId: next.locusId, stage: 'front', card: next, unitId: next.mnemonic.unitIds[unitIndex + 1] }); return
        }
        const nextIndex = session.index + 1
        if (nextIndex >= session.queue.length) {
          writeLastReviewSummary({ version: 1, sessionId: session.id, kind: session.kind, palaceId: session.palaceId, startedAt: session.startedAt, finishedAt: reviewedAt, stats: nextStats })
          clearActiveReviewSession(); setReviewSession(null); setTrain(null); navigate('/review/summary'); return
        }
        const nextSession: ReviewSessionV1 = { ...session, index: nextIndex, stats: nextStats }
        writeActiveReviewSession(nextSession); setReviewSession(nextSession); return
      }
      if (next.mnemonic && unitIndex + 1 < next.mnemonic.unitIds.length) {
        setTrain({ locusId: next.locusId, stage: 'front', card: next, unitId: next.mnemonic.unitIds[unitIndex + 1] }); return
      }
      const routeCards = [...byIdRef.current.values()].filter(c => c.mnemonic).sort((a, b) => a.routeIndex - b.routeIndex)
      const following = routeCards[routeCards.findIndex(c => c.locusId === next.locusId) + 1]
      if (following) { worldRef.current?.teleportNearAndAim(following.locusId); setTrain({ locusId: following.locusId, stage: 'front', card: following, unitId: following.mnemonic?.unitIds[0] }) }
      else { setTrain(null); setPracticeNotice('已到达路线末尾。所有评分按含义单元分别保存；可以选择任意点继续练习。') }
    } catch (error) { if (epoch === routeEpochRef.current) setMapError(error instanceof Error ? error.message : '评分保存失败，请重试。') }
    finally { if (epoch === routeEpochRef.current) { ratingBusyRef.current = false; setRatingBusy(false) } }
  }

  async function handleFire() {
    const epoch = routeEpochRef.current
    if (ratingBusyRef.current) return
    if (openCardRef.current) return
    if (!palaceId) return

    const world = worldRef.current
    if (!world) return

    const session = reviewSessionRef.current
    if ((session && session.palaceId === palaceId) || trainRef.current?.card.mnemonic) {
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
    if (epoch !== routeEpochRef.current) return

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
    if (!palaceId || ratingBusyRef.current) return
    const current = trainRef.current
    if (!current || current.stage !== 'front') return
    ratingBusyRef.current = true; setRatingBusy(true); setMapError(null)
    const epoch = routeEpochRef.current
    try {
      const existing = await resolveCard(current.locusId), unitId = current.unitId ?? existing.mnemonic?.unitIds[0]
      const next = unitId && existing.mnemonic ? recordUnitReveal(existing, unitId) : { ...existing, revealedCount: (existing.revealedCount ?? 0) + 1, updatedAt: nowIso() }
      await upsertCard(next); if (epoch !== routeEpochRef.current) return; worldRef.current?.playRevealFeedback(); await reload()
      if (epoch !== routeEpochRef.current) return
      setTrain({ locusId: current.locusId, stage: 'back', card: next, unitId })
    } catch (error) { if (epoch === routeEpochRef.current) setMapError(error instanceof Error ? error.message : '答案读取失败，请重试。') }
    finally { if (epoch === routeEpochRef.current) { ratingBusyRef.current = false; setRatingBusy(false) } }
  }

  function onEditFromTrain() {
    if (!train) return
    const idx = routeIndexFromLocusId(train.locusId) ?? train.card.routeIndex
    setTrain(null)
    if (!palaceId) return
    if (train.card.mnemonic) { navigate(`/palace/${palaceId}/quick-import?anchor=${encodeURIComponent(train.card.mnemonic.anchorId)}`); return }
    setOpenCard({ locusId: train.locusId, card: train.card ?? emptyCard(palaceId, train.locusId, idx) })
  }

  const semanticTrain = useMemo(() => {
    if (!train || train.card.palaceId !== palaceId || palace?.id !== palaceId) return null
    try { return semanticRecallView(train.card, palace.mnemonicPlan, train.unitId) } catch { return null }
  }, [train, palace, palaceId])
  const currentAttachmentKey = train ? `${train.locusId}:${train.unitId ?? train.card.mnemonic?.unitIds[0] ?? ''}:${train.card.updatedAt}` : ''
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
      <div className={`map-root${activeScene?.id === 'dust2-callouts' ? ' map-root--callouts' : ''}`} ref={rootRef}>
        <div className="map-canvas" ref={canvasRef} />

        <LocusDrawer
          open={drawerOpen}
          palace={palace}
          scene={activeScene}
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
          locusCount={activeScene?.anchors.length ?? LOCUS_COUNT}
          run={run}
          mode={mode}
          modeToggleDisabled={reviewSession !== null}
          onEnterVr={() => void enterVr()}
          onExitVr={() => void exitVr()}
          onOpenDrawer={() => setDrawerOpen(true)}
          onToggleRun={() => setRun((v) => !v)}
          onToggleMode={() => setMode((m) => (m === 'train' ? 'explore' : 'train'))}
        />

        {palace?.mnemonicPlan && <div className="map-scene-caption" style={{position:'absolute',left:16,top:16,maxWidth:360,padding:12,borderRadius:12,background:'rgba(30,34,31,.84)',color:'#fff'}}>
          <strong>{activeScene?.title ?? '记忆宫殿'}</strong>
          <p style={{margin:'6px 0',fontSize:12}}>{activeScene?.anchors.find(a => a.locusId === (train?.locusId ?? nearLocusId))?.label ?? '按点位浏览，建立熟悉的路线。'} · 编号是回忆顺序</p>{viewWarning && <p role="status" className="hint">{viewWarning}</p>}{activeScene?.attribution && <p className="hint" style={{ fontSize: 11 }}><a href={activeScene.attribution.url} target="_blank" rel="noopener noreferrer">场景：{activeScene.attribution.creator} · {activeScene.attribution.license}</a></p>}
          <p style={{margin:'6px 0',fontSize:12}}>用“点位”跳转，靠近线索后点击“回忆”。</p>
          <ExportOfflineButton palace={palace} cards={cards} />
          <details><summary style={{cursor:'pointer',fontSize:12,marginTop:8}}>文字点位 / 无需 3D</summary>
            <div style={{maxHeight:180,overflow:'auto',display:'grid',gap:5,marginTop:8}}>
              {!!palace.unassignedAttachments?.length && <p className="hint">保留了 {palace.unassignedAttachments.length} 个待重新分配附件。进入任一片段的“管理线索附件”可重新选择；备份会包含这些文件。</p>}{cards.filter(c=>c.mnemonic).sort((a,b)=>a.routeIndex-b.routeIndex).map(card=><button key={card.locusId} className="btn" disabled={reviewSession !== null || ratingBusy} onClick={()=>{setMode('train');setTrain({locusId:card.locusId,card,stage:'front'})}}>{card.locusId} · {activeScene?.anchors.find(a=>a.locusId===card.locusId)?.label ?? card.prompt}</button>)}
            </div>
          </details>
        </div>}
        {mapBusy && <div role="status" style={{position:'absolute',bottom:22,left:'50%',transform:'translateX(-50%)',background:'#25322ddd',color:'white',padding:'10px 18px',borderRadius:12}}>{mapBusy}</div>}
        {mapError && <div role="alert" style={{position:'absolute',bottom:22,left:'50%',transform:'translateX(-50%)',maxWidth:'70%',background:'#4b2929ed',color:'white',padding:'10px 18px',borderRadius:12}}>{mapError}{palace?.mnemonicPlan && <> <Link to={`/palace/${palace.id}/quick-import`}>重新核对材料与地标</Link></>}</div>}
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
                回忆
              </button>
            ) : null}
          </>
        ) : null}

        {practiceNotice && <p role="status" className="hint" style={{ position: 'absolute', bottom: 10, left: 12, maxWidth: '50%', background: '#142028', padding: 8 }}>{practiceNotice}</p>}
        {mode === 'train' && train && train.card.palaceId === palaceId && !vrActive && (!train.card.mnemonic || semanticTrain) ? (
          <TrainPanel
            locusId={train.locusId}
            card={train.card}
            stage={train.stage}
            semantic={semanticTrain}
            hasModelAttachment={!!train.card.modelId && attachmentRole(train.card, train.card.modelId, semanticTrain?.unitId) === 'reference'}
            onSelectModel={() => setSceneImage({ key: currentAttachmentKey, id: '__model__' })}
            onSelectImage={id => setSceneImage({ key: currentAttachmentKey, id })}
            onEditAttachments={() => setOpenCard({ locusId: train.locusId, card: train.card, attachmentsOnly: true })}
            attachmentVisible={attachmentChoice === currentAttachmentKey}
            onToggleAttachment={() => { setAttachmentChoice(attachmentChoice === currentAttachmentKey ? null : currentAttachmentKey); setSceneImage({ key: currentAttachmentKey, id: '__model__' }) }}
            onSelectUnit={train.card.mnemonic && !reviewSession ? index => setTrain({ ...train, stage: 'front', unitId: train.card.mnemonic!.unitIds[index] }) : undefined}
            progress={reviewSession ? { current: reviewSession.index + 1, total: reviewSession.queue.length } : null}
            showRating={reviewSession !== null || !!semanticTrain}
            ratingBusy={ratingBusy}
            onRate={reviewSession || semanticTrain ? (c) => void onRate(c) : undefined}
            onReveal={() => void onRevealAnswer()}
            onEdit={onEditFromTrain}
            onClose={() => {
              if (reviewSession) void exitReview()
              else setTrain(null)
            }}
          />
        ) : null}
      </div>

      {isPortrait && !palace?.mnemonicPlan ? (
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
          attachmentsOnly={openCard.attachmentsOnly}
          unassignedAttachments={palace?.unassignedAttachments}
          onClose={() => setOpenCard(null)}
          onSaved={card => { setTrain(current => current?.locusId === card.locusId ? { ...current, card, stage: 'front' } : current); void reload() }}
        />
      ) : null}
    </div>
  )
}

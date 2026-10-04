export type BarcodeDetectorLike = {
  detect(image: ImageBitmapSource): Promise<Array<{ rawValue: string }>>
}

/** Owns one capture session. Every asynchronous boundary rechecks disposal. */
export function startQrCapture(options: {
  video: HTMLVideoElement
  detector: BarcodeDetectorLike
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  requestFrame: (callback: FrameRequestCallback) => number
  cancelFrame: (id: number) => void
  onText: (text: string) => void
  onError: (message: string) => void
}): () => void {
  const { video, detector } = options
  let stream: MediaStream | null = null
  let cancelled = false
  let raf: number | null = null
  let lastText = ''
  const stopStream = () => {
    if (!stream) return
    for (const track of stream.getTracks()) track.stop()
    if (video.srcObject === stream) video.srcObject = null
    stream = null
  }
  const tick = async () => {
    raf = null
    if (cancelled) return
    try {
      const codes = await detector.detect(video)
      if (cancelled) return
      const raw = codes[0]?.rawValue?.trim()
      if (raw && raw !== lastText) { lastText = raw; options.onText(raw) }
    } catch { /* A frame without a detectable code is normal. */ }
    if (!cancelled) raf = options.requestFrame(tick)
  }
  void (async () => {
    try {
      stream = await options.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      if (cancelled) { stopStream(); return }
      video.srcObject = stream
      video.playsInline = true
      await video.play()
      if (cancelled) return
      raf = options.requestFrame(tick)
    } catch (error) {
      stopStream()
      if (!cancelled) options.onError(error instanceof Error ? error.message : String(error))
    }
  })()
  return () => {
    cancelled = true
    if (raf !== null) options.cancelFrame(raf)
    raf = null
    stopStream()
  }
}

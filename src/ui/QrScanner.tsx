import { useEffect, useRef, useState } from 'react'

type BarcodeDetectorLike = {
  detect(image: ImageBitmapSource): Promise<Array<{ rawValue: string }>>
}

type BarcodeDetectorConstructorLike = new (opts: { formats: string[] }) => BarcodeDetectorLike

function getBarcodeDetectorCtor(): BarcodeDetectorConstructorLike | null {
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorConstructorLike }
  return w.BarcodeDetector ?? null
}

export default function QrScanner(props: {
  active: boolean
  onText: (text: string) => void
  onError?: (message: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const onTextRef = useRef(props.onText)
  const onErrorRef = useRef(props.onError)
  const lastTextRef = useRef<string>('')
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    onTextRef.current = props.onText
    onErrorRef.current = props.onError
  }, [props.onText, props.onError])

  useEffect(() => {
    if (!props.active) return

    const Ctor = getBarcodeDetectorCtor()
    if (!Ctor) {
      setSupported(false)
      return
    }
    setSupported(true)

    const detector = new Ctor({ formats: ['qr_code'] })

    let stream: MediaStream | null = null
    let cancelled = false
    let raf = 0

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop()
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        video.playsInline = true
        await video.play()

        const tick = async () => {
          if (cancelled) return
          const v = videoRef.current
          if (v) {
            try {
              const codes = await detector.detect(v)
              const raw = codes[0]?.rawValue?.trim()
              if (raw && raw !== lastTextRef.current) {
                lastTextRef.current = raw
                onTextRef.current(raw)
              }
            } catch {
              // ignore
            }
          }
          raf = requestAnimationFrame(tick)
        }

        raf = requestAnimationFrame(tick)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        onErrorRef.current?.(msg)
      }
    }

    void start()

    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
      if (stream) {
        for (const t of stream.getTracks()) t.stop()
      }
      const video = videoRef.current
      if (video) video.srcObject = null
    }
  }, [props.active])

  if (!props.active) return null
  if (supported === false) {
    return <p className="hint">当前浏览器不支持相机扫码（BarcodeDetector）。可改用复制/粘贴。</p>
  }

  return <video className="scan__video" ref={videoRef} muted />
}


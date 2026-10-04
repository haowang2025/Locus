import { useEffect, useRef } from 'react'
import { startQrCapture, type BarcodeDetectorLike } from '../lib/qrCapture'

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
  const supported = getBarcodeDetectorCtor() !== null

  useEffect(() => {
    onTextRef.current = props.onText
    onErrorRef.current = props.onError
  }, [props.onText, props.onError])

  useEffect(() => {
    if (!props.active) return

    const Ctor = getBarcodeDetectorCtor()
    const video = videoRef.current
    if (!Ctor || !video) return
    return startQrCapture({
      video,
      detector: new Ctor({ formats: ['qr_code'] }),
      getUserMedia: constraints => navigator.mediaDevices.getUserMedia(constraints),
      requestFrame: callback => requestAnimationFrame(callback),
      cancelFrame: id => cancelAnimationFrame(id),
      onText: text => onTextRef.current(text),
      onError: message => onErrorRef.current?.(message),
    })
  }, [props.active])

  if (!props.active) return null
  if (supported === false) {
    return <p className="hint">当前浏览器不支持相机扫码（BarcodeDetector）。可改用复制/粘贴。</p>
  }

  return <video className="scan__video" ref={videoRef} muted />
}


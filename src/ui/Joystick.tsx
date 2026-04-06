import { useEffect, useMemo, useRef, useState } from 'react'

type Vec2 = { x: number; y: number }

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export default function Joystick(props: {
  radius?: number
  onMove: (vec: Vec2) => void
  className?: string
}) {
  const radius = props.radius ?? 44
  const ref = useRef<HTMLDivElement | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [knob, setKnob] = useState<Vec2>({ x: 0, y: 0 })
  const originRef = useRef<Vec2>({ x: 0, y: 0 })

  const knobStyle = useMemo(() => {
    return {
      transform: `translate(-50%, -50%) translate(${knob.x}px, ${knob.y}px)`,
    } as const
  }, [knob.x, knob.y])

  useEffect(() => {
    return () => props.onMove({ x: 0, y: 0 })
  }, [props])

  function setMoveFromDelta(dx: number, dy: number) {
    const x = clamp(dx, -radius, radius)
    const y = clamp(dy, -radius, radius)
    setKnob({ x, y })
    const nx = clamp(x / radius, -1, 1)
    const ny = clamp(y / radius, -1, 1)
    props.onMove({ x: nx, y: ny })
  }

  function onPointerDown(e: React.PointerEvent) {
    if (activeId !== null) return
    if (!ref.current) return
    setActiveId(e.pointerId)
    originRef.current = { x: e.clientX, y: e.clientY }
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    setMoveFromDelta(0, 0)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (activeId !== e.pointerId) return
    const dx = e.clientX - originRef.current.x
    const dy = e.clientY - originRef.current.y
    setMoveFromDelta(dx, dy)
  }

  function onPointerUp(e: React.PointerEvent) {
    if (activeId !== e.pointerId) return
    setActiveId(null)
    setKnob({ x: 0, y: 0 })
    props.onMove({ x: 0, y: 0 })
  }

  function onPointerCancel(e: React.PointerEvent) {
    if (activeId !== e.pointerId) return
    setActiveId(null)
    setKnob({ x: 0, y: 0 })
    props.onMove({ x: 0, y: 0 })
  }

  return (
    <div
      ref={ref}
      className={props.className ?? 'joystick'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      role="application"
      aria-label="移动摇杆"
    >
      <div className="joystick__base" />
      <div className="joystick__knob" style={knobStyle} />
    </div>
  )
}

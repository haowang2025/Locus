import type { LocusId } from '../lib/types'

export default function PromptHud(props: { locusId: LocusId; text: string; mode: 'compact' | 'full' }) {
  return (
    <div className={`prompt-hud ${props.mode === 'compact' ? 'prompt-hud--compact' : 'prompt-hud--full'}`}>
      <div className="prompt-hud__title">{props.locusId} 正面</div>
      <div className="prompt-hud__text">{props.text}</div>
    </div>
  )
}


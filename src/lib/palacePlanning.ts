import type { CueShape, MeaningUnit, MnemonicCue, PalacePlan } from './palaceTypes'
import type { SceneAnchor, SceneDefinition } from './sceneRegistry'
import { initializeSemanticCue } from './palaceSemanticReview'
import { segmentSource } from './palaceSegmentation'

function affinity(unit: MeaningUnit, anchor: SceneAnchor): number {
  const corpus = unit.facts.toLocaleLowerCase()
  return [...anchor.semanticTags, ...anchor.affordances, anchor.label].reduce((score, word) => score + (corpus.includes(word.toLocaleLowerCase()) ? Math.min(word.length, 8) : 0), 0)
}

const RULES: { words: RegExp; shape: CueShape; object: string; action: string; color: string }[] = [
  { words: /不(?:能|可|得|应)|禁止|防护|保护|风险|\bnot\b|\bnever\b/iu, shape: 'shield', object: '带有十字纹的防护盾', action: '盾牌挡住前进的动作，提醒先说出限制及例外条件', color: '#e85b62' },
  { words: /时间|周期|小时|分钟|秒|截止|期限|年|月|\btime\b|\bdeadline\b/iu, shape: 'clock', object: '指针夸张的立体钟', action: '时钟慢慢旋转，想象指针依次经过原文的时间节点', color: '#efba61' },
  { words: /水|液体|溶液|湿度|光合作用|\bwater\b/iu, shape: 'water', object: '带蓝色水滴的浅容器', action: '容器与水滴一起上下起伏，把每种原料或变化阶段想象成一次注入与流出', color: '#60b7dc' },
  { words: /因为|因此|导致|因果|关联|依赖|链|\bcause\b/iu, shape: 'chain', object: '四环相扣的因果链', action: '链环缓缓旋转，沿着第一环到最后一环复述原因、过程和结果', color: '#d9ab67' },
  { words: /连接|跨越|转换|转化|迁移|传递|运输|\bbridge\b|\btransfer\b/iu, shape: 'bridge', object: '带栏杆与桥墩的小桥', action: '小桥轻轻起伏，想象从起点携带原文中的对象走到终点', color: '#80bea2' },
  { words: /条件|只有|仅当|除非|权限|解锁|关键|\bif\b|\bunless\b|\bkey\b/iu, shape: 'key', object: '齿纹清晰的巨大钥匙', action: '钥匙缓缓转动，只有完整说出原文条件，才想象锁被打开', color: '#e4be5d' },
  { words: /[=≠≤≥]|比较|平衡|比例|比率|大于|小于|\bcompare\b/iu, shape: 'scale', object: '左右两盘的天平', action: '天平轻轻起伏，在脑中把关系两侧及比较符号分别放在两盘之间', color: '#a6bccc' },
  { words: /隔离|暂停|停止|封锁|\bisolat(?:e|ion)\b|\bstop\b/iu, shape: 'shield', object: '用于暂停与隔离联想的盾牌', action: '想象盾牌隔开作业区，口头补全何时停止、隔离什么，以及恢复条件', color: '#e85b62' },
  { words: /通知|报告警情|警报|联系|\bnotif(?:y|ication)\b|\balarm\b|\bcontact\b/iu, shape: 'ring', object: '用于联系与提醒联想的信号环', action: '想象环形信号传到接收人；实际道具只是圆环，需要自己补全通知对象和内容', color: '#c59bea' },
  { words: /检查|核对|复核|验证|\bcheck\b|\bverif(?:y|ication)\b|\binspect(?:ion)?\b/iu, shape: 'key', object: '用于检查通过联想的钥匙', action: '想象完成检查才拿到钥匙，口头补全检查对象、标准和不通过时的处理', color: '#e4be5d' },
  { words: /记录|登记|报告|填写|\brecord\b|\breport\b|\bregister\b/iu, shape: 'book', object: '用于记录与报告联想的立体书', action: '想象把信息写入书页；实际书页没有文字，需口头补全记录内容和交给谁', color: '#63bccc' },
  { words: /\d/, shape: 'cone', object: '金色计量圆锥（刻度为想象）', action: '计量锥轻轻起伏，每次停顿先回忆原文的数字、单位和适用范围', color: '#edb95b' },
]

/** Ignore only clearly delimited list labels for visual-category matching.
 * Evidence, facts, protected tokens and source offsets always retain the labels. */
function cueMatchingText(facts: string): string {
  return facts.replace(/^([ \t]*)(?:第[一二三四五六七八九十百零\d]+[步条项章节][：:、.． \t]+|(?:\d{1,4}|[一二三四五六七八九十百零]+)(?:[)）、][ \t]*|[.．][ \t]+)|[（(]\d{1,4}[)）][ \t]*)/gm, '$1')
}

export function offlineCue(unit: MeaningUnit, anchor: SceneAnchor): MnemonicCue {
  const matchingText = cueMatchingText(unit.facts)
  const rule = RULES.find(r => r.words.test(matchingText))
  const keyword = rule?.words.exec(matchingText)?.[0]
  const shape = rule?.shape ?? 'book'
  const object = rule?.object ?? '带书脊的立体书'
  const action = `${rule?.action ?? '书本缓缓旋转，把主要概念想象在封面、其解释或例子想象在封底'}。它位于${anchor.label}的指定联想空间；结合地标的「${anchor.affordances[0] ?? '观察'}」动作记忆。`
  const cue: MnemonicCue = { unitId: unit.id, anchorId: anchor.id, volumeId: anchor.cueVolume.id, object, action, spatialRelation: anchor.cueVolume.allowedRelations[0], relationId: anchor.cueVolume.allowedRelationIds[0], rationale: `规则映射${keyword ? `：原文「${keyword}」触发${object}` : '：未识别专门的视觉语义，暂用书页占位'}。地标依据：「${anchor.landmark.description}」，可利用 ${anchor.affordances.join('、')}。这个可见物体只提示概念类别，不表示原文数字或事实已被完整编码。请把动作和物体编辑成你能对应回「${unit.title}」的具体联想。`, visual: { shape, color: rule?.color ?? '#63bccc', motion: shape === 'shield' ? 'pulse' : ['water', 'scale', 'cone', 'bridge'].includes(shape) ? 'bounce' : 'spin' }, reviewed: false }
  return initializeSemanticCue(unit, cue, anchor)
}

export function proposeOfflineCues(units: MeaningUnit[], scene: SceneDefinition, ordering: 'source' | 'semantic' = 'source'): MnemonicCue[] {
  if (ordering === 'source') {
    const anchors = scene.anchors.filter(a => Math.min(a.capacity, a.cueVolume.maxObjects) > 0).slice().sort((a, b) => a.routeOrder - b.routeOrder)
    const cues: MnemonicCue[] = []; let cursor = 0
    for (let i = 0; i < anchors.length && cursor < units.length; i++) {
      const anchor = anchors[i], remaining = units.length - cursor, capacity = Math.min(anchor.capacity, anchor.cueVolume.maxObjects)
      const laterCapacity = anchors.slice(i + 1).reduce((sum, a) => sum + Math.min(a.capacity, a.cueVolume.maxObjects), 0)
      const balanced = Math.ceil(remaining / (anchors.length - i))
      const count = Math.min(capacity, remaining, Math.max(balanced, remaining - laterCapacity))
      for (let n = 0; n < count; n++) cues.push(offlineCue(units[cursor++], anchor))
    }
    return cues // Any overflow units remain in the plan and block saving.
  }
  const counts = new Map<string, number>()
  return units.flatMap(unit => {
    const available = scene.anchors.filter(a => (counts.get(a.id) ?? 0) < Math.min(a.capacity, a.cueVolume.maxObjects))
    available.sort((a, b) => affinity(unit, b) - affinity(unit, a) || (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0) || a.routeOrder - b.routeOrder)
    const anchor = available[0]
    if (!anchor) return [] // unit stays visible/unassigned; validation blocks save.
    counts.set(anchor.id, (counts.get(anchor.id) ?? 0) + 1)
    return [offlineCue(unit, anchor)]
  })
}

export function createOfflinePlan(text: string, title: string, scene: SceneDefinition, ordering: 'source' | 'semantic' = 'source'): PalacePlan {
  const units = segmentSource(text, 240)
  return { schemaVersion: 1, source: { text, title: title.trim() || '未命名材料' }, sceneId: scene.id, sceneVersion: scene.version, ordering, generation: { mode: 'offline-rule-based' }, units, cues: proposeOfflineCues(units, scene, ordering), createdAt: new Date().toISOString() }
}

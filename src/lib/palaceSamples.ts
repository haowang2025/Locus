import type { CueShape, MnemonicCue, PalacePlan, PalaceSource } from './palaceTypes'
import { initializeSemanticCue, sourceSemanticInventory } from './palaceSemanticReview'
import { segmentSource } from './palaceSegmentation'
import { EXECUTABLE_CUE_RELATIONS, getSceneDefinition } from './sceneRegistry'

export interface SampleMaterial { id: string; category: string; source: PalaceSource; description: string }
/** Facts are short authored paraphrases. Imagery is separately authored, never claimed as a model run. */
export const SAMPLE_MATERIALS: SampleMaterial[] = [
  { id: 'procedure', category: '流程', description: '验证 → 准备 → 提交：保留步骤顺序与禁止条件。', source: { title: '本应用的安全备份恢复流程', text: '1. 先校验备份清单、原文覆盖与资源引用；校验失败时，不创建新宫殿。\n2. 再完整解压资源，并为资源重新分配 ID，避免覆盖已有宫殿的资源。\n3. 最后在同一个数据库事务中写入资源、卡片和宫殿；任何写入失败时，撤销本次事务。' } },
  { id: 'science', category: '科学', description: '牛顿三定律：区分事实、条件和可见的助记物件。', source: { title: '经典力学：牛顿三定律', text: '第一定律：当物体所受合力为零时，物体保持静止或匀速直线运动。\n第二定律：在质量保持不变的经典力学情形下，合力等于质量与加速度的乘积，即 F = ma。\n第三定律：两个物体之间的作用力与反作用力大小相等、方向相反，分别作用在两个不同的物体上。', references: [{ title: 'NASA：Newton’s Laws of Motion', url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/newtons-laws-of-motion/' }] } },
  { id: 'history', category: '历史', description: '三个文件、三个日期：不要把通过、签署和批准混为一谈。', source: { title: '美国建国文件：三个不同的日期', text: '1776年7月4日，大陆会议通过《独立宣言》。\n1787年9月17日，美国宪法在制宪会议上签署。\n1791年12月15日，十条修正案获批准，成为《权利法案》。', references: [{ title: '美国国家档案馆：独立宣言（1776）', url: 'https://www.archives.gov/milestone-documents/declaration-of-independence' }, { title: '美国国家档案馆：美国宪法（1787）', url: 'https://www.archives.gov/milestone-documents/constitution' }, { title: '美国国家档案馆：权利法案', url: 'https://www.archives.gov/legislative/features/bor' }] } },
]

type AuthoredCue = { anchorId: string; shape: CueShape; color: string; motion: MnemonicCue['visual']['motion']; object: string; action: string; relation: string; rationale: string; question: string }
const DEMOS: Record<string, AuthoredCue[]> = {
  procedure: [
    { anchorId: 'hall-entry', shape: 'shield', color: '#db6971', motion: 'pulse', object: '入口处的红色校验盾', action: '红盾在迎宾台上发出脉冲。想象它挡住一份未通过检查的备份；只有检查通过才继续走下一站。', relation: '放在台面', rationale: '入口是流程起点；盾表示先检查再进入。红色与阻挡动作专门提示「校验失败时，不创建」，不能只记住检查这一步而漏掉否定条件。实际画面显示盾与脉冲，阻挡文件是创意想象。', question: '第一步的动作与失败时的处理要求分别是什么？' },
    { anchorId: 'hall-atlas', shape: 'book', color: '#deb65d', motion: 'none', object: '图册上方的备份副本书', action: '副本书停在摊开的图册书页上。想象把原资源逐页复制到新书，并在新书贴上全新的 ID 标签。', relation: '铺在书页上', rationale: '图册与副本书形成原件/副本的关系，提醒「完整解压」和「重新分配 ID」是两个要求。静止的完整书本表示准备完成后再往下走；新标签是想象内容，不声称场景显示了实际资源 ID。', question: '第二步需要完成哪些准备？它们要避免什么问题？' },
    { anchorId: 'hall-table', shape: 'chain', color: '#6cbbaa', motion: 'pulse', object: '八角桌中央的事务链', action: '链条在黄铜环附近一起脉冲。想象资源、卡片、宫殿由这条链连接：任何一环失败，就把整条链撤回。', relation: '汇聚到铜环', rationale: '中央桌的汇聚特征对应最后的统一提交；连成整体的链提示「同一个事务」。链的环数不代表写入项数量，真正的三个写入对象与失败撤销条件仍以原文为准。', question: '最后一步怎样提交数据？出现错误时如何处理？' },
  ],
  science: [
    { anchorId: 'hall-entry', shape: 'sphere', color: '#74bbd3', motion: 'none', object: '保持静止的蓝色惯性球', action: '蓝球在迎宾台上保持静止。先用这个静止例子回忆合力为零，再补全另一种可能：匀速直线运动。', relation: '放在台面', rationale: '稳定台面上的静止球是第一定律的一种状态提示。不能误记成「合力为零就只能静止」；另一个状态与合力条件必须口头补全。此摆件不是受力仿真。', question: '第一定律描述的条件与运动状态分别是什么？' },
    { anchorId: 'hall-atlas', shape: 'cart', color: '#edba64', motion: 'none', object: '双页图册前的四轮质量小车', action: '四轮小车放在图册前。想象施加合力 F 推动质量为 m 的车，再用右页记住加速度 a。实际摆件保持静止，推车过程是创意想象。', relation: '铺在书页上', rationale: '有轮子的小车提供可以被推动的具体物体；车对应质量，推的动作对应合力，速度变化对应加速度。必须补全 F = ma 与质量不变的条件。摆件不执行物理计算，不能根据它测量加速度。', question: '第二定律的适用条件、涉及的量和完整关系分别是什么？' },
    { anchorId: 'hall-chess', shape: 'force-pair', color: '#92c7a2', motion: 'none', object: '分属两个物体的相反力箭头', action: '在黑白棋盘上观察两个分开的物体及方向相反的箭头。指向每个物体，分别说出它受到的那一个力。', relation: '比较黑白两侧', rationale: '黑白两侧和分开的物体共同强调「作用在不同物体上」；相反箭头提醒方向相反。箭头长度只是符号设计，实际力的大小相等需要从原文复述，不可把两个力在同一个物体上抵消。', question: '作用力与反作用力的大小、方向、受力对象各有什么关系？' },
  ],
  history: [
    { anchorId: 'hall-atlas', shape: 'book', color: '#ca786b', motion: 'none', object: '红色宣言书', action: '红书停在图册书页上。想象会议代表举手通过宣言，并把「1776-07-04」写进脑中的扉页。', relation: '铺在书页上', rationale: '书对应文件；举手这一想象动作对应「通过」，避免误当作签署。日期是要单独回忆的原文信息，当前三维书上没有印出日期。', question: '与《独立宣言》对应的日期、机构和历史动作分别是什么？' },
    { anchorId: 'hall-clock', shape: 'clock', color: '#deb567', motion: 'none', object: '摆钟前的宪法时钟', action: '小钟位于高身摆钟前。想象时钟停在一个签字仪式：1787年9月17日，代表签署宪法。', relation: '从钟柜前升起', rationale: '大钟与小钟形成显眼的时间地标，提醒第二个时间点；想象中的签字动作对应「签署」。钟面不编码这个日期，不能把普通钟面读成 1787-09-17。', question: '与美国宪法对应的日期和历史动作分别是什么？' },
    { anchorId: 'hall-table', shape: 'shield', color: '#81b9cb', motion: 'pulse', object: '讨论桌中央的权利盾', action: '权利盾在桌面黄铜环附近脉冲。想象十条修正案逐条汇聚到盾后，日期为1791年12月15日。', relation: '汇聚到铜环', rationale: '盾表示权利保障，中央桌的汇聚特征提示多条修正案成为一组。十条和批准日期仍必须从原文准确复述；摆件不实际展示十块盾，也不声称脉冲次数等于十。', question: '与《权利法案》对应的数量、日期和历史动作分别是什么？' },
  ],
}

export function createAuthoredDemo(id: string): PalacePlan {
  const sample = SAMPLE_MATERIALS.find(s => s.id === id)
  if (!sample) throw new Error('找不到示例材料。')
  const scene = getSceneDefinition('reading-hall'), units = segmentSource(sample.source.text), authored = DEMOS[id]
  if (units.length !== authored.length) throw new Error('示例的含义单元边界需要更新。')
  const cues = units.map((unit, i): MnemonicCue => {
    const draft = authored[i], anchor = scene.anchors.find(a => a.id === draft.anchorId)!
    const relationId = draft.shape === 'shield' ? 'frame' : 'ordered-row'
    unit.question = draft.question
    const cue: MnemonicCue = { unitId: unit.id, anchorId: anchor.id, volumeId: anchor.cueVolume.id, object: draft.object, action: draft.action, spatialRelation: EXECUTABLE_CUE_RELATIONS[relationId], relationId, rationale: draft.rationale, visual: { shape: draft.shape, color: draft.color, motion: draft.motion }, reviewed: false }
    return initializeSemanticCue(unit, cue, anchor, { mappings: sourceSemanticInventory(unit).map(item => ({ quote: item.quote, explanation: draft.rationale })) })
  })
  return { schemaVersion: 1, source: structuredClone(sample.source), sceneId: scene.id, sceneVersion: scene.version, ordering: 'source', generation: { mode: 'authored-demo' }, units, cues, createdAt: new Date().toISOString() }
}

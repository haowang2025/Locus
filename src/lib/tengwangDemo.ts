import { createPalace, listPalaces, nowIso, replaceCards } from './db'
import { locusIdFromRouteIndex } from './loci'
import type { CardRecord } from './types'

type DemoCard = {
  prompt: string
  answer: string
  note: string
}

const DEMO_CARDS: DemoCard[] = [
  {
    prompt: '豫章故郡 → 接下去？',
    answer: '豫章故郡，洪都新府。',
    note: '空间联想：旧城门上的“豫章”牌匾翻面，瞬间变成崭新的“洪都新府”。',
  },
  {
    prompt: '星分翼轸 → 地接？',
    answer: '星分翼轸，地接衡庐。',
    note: '空间联想：天上的翼、轸两颗巨星坠下，衡山、庐山从地面升起接住它们。',
  },
  {
    prompt: '襟三江而带五湖 → 后半句？',
    answer: '襟三江而带五湖，控蛮荆而引瓯越。',
    note: '空间联想：衣襟里装着三条江，腰间缠着五个湖，两只手分别“控”蛮荆、“引”瓯越。',
  },
  {
    prompt: '物华天宝 → 后半句？',
    answer: '物华天宝，龙光射牛斗之墟；',
    note: '空间联想：遍地宝物突然发光，一条龙形光束直射天上的牛宿、斗宿。',
  },
  {
    prompt: '人杰地灵 → 后半句？',
    answer: '人杰地灵，徐孺下陈蕃之榻。',
    note: '空间联想：徐孺从高处缓缓落下，陈蕃赶紧把专门悬着的床榻放下来迎接。',
  },
  {
    prompt: '雄州雾列 → 接下去？',
    answer: '雄州雾列，俊采星驰。',
    note: '空间联想：雄伟城池像雾一样成排出现，俊杰们化作群星高速划过天空。',
  },
  {
    prompt: '台隍枕夷夏之交 → 后半句？',
    answer: '台隍枕夷夏之交，宾主尽东南之美。',
    note: '空间联想：高台城池像枕头压在夷夏交界处，东南方向聚满华丽的宾客和主人。',
  },
  {
    prompt: '都督阎公之雅望 → 后半句？',
    answer: '都督阎公之雅望，棨戟遥临；',
    note: '空间联想：阎都督举着象征仪仗的棨戟，从很远的地方缓缓降临。',
  },
  {
    prompt: '宇文新州之懿范 → 后半句？',
    answer: '宇文新州之懿范，襜帷暂驻。',
    note: '空间联想：宇文新州乘着华美车驾，巨大的襜帷突然停在眼前。',
  },
  {
    prompt: '十旬休假 → 接下去？',
    answer: '十旬休假，胜友如云；',
    note: '空间联想：一张写着“十旬休假”的巨大假条展开，好友像云层一样从四面聚拢。',
  },
  {
    prompt: '千里逢迎 → 接下去？',
    answer: '千里逢迎，高朋满座。',
    note: '空间联想：远方千里之外的人一路迎来，座位瞬间被高朋坐满。',
  },
  {
    prompt: '腾蛟起凤 → 后半句？',
    answer: '腾蛟起凤，孟学士之词宗；',
    note: '空间联想：蛟龙腾空、凤凰起飞，最后盘旋在孟学士写出的巨大文章上。',
  },
  {
    prompt: '紫电青霜 → 后半句？',
    answer: '紫电青霜，王将军之武库。',
    note: '空间联想：紫色闪电和青色寒霜化成两把宝剑，插入王将军的武器库。',
  },
  {
    prompt: '家君作宰 → 后半句？',
    answer: '家君作宰，路出名区；',
    note: '空间联想：父亲身穿官服站在道路尽头，脚下道路穿过一块写着“名区”的巨大牌坊。',
  },
  {
    prompt: '童子何知 → 接下去？',
    answer: '童子何知，躬逢胜饯。',
    note: '空间联想：一个懵懂童子摊开双手，却亲自撞进一场盛大的宴会。',
  },
  {
    prompt: '整段串联：不看提示，沿 L01 → L15 完整背诵第一段。',
    answer:
      '豫章故郡，洪都新府。星分翼轸，地接衡庐。襟三江而带五湖，控蛮荆而引瓯越。物华天宝，龙光射牛斗之墟；人杰地灵，徐孺下陈蕃之榻。雄州雾列，俊采星驰。台隍枕夷夏之交，宾主尽东南之美。都督阎公之雅望，棨戟遥临；宇文新州之懿范，襜帷暂驻。十旬休假，胜友如云；千里逢迎，高朋满座。腾蛟起凤，孟学士之词宗；紫电青霜，王将军之武库。家君作宰，路出名区；童子何知，躬逢胜饯。',
    note: '整段测试：先在脑中依次回放 L01–L15 的空间画面；只有真正卡住时再揭晓答案。',
  },
]

export async function seedTengwangDemoIfEmpty(): Promise<void> {
  const existing = await listPalaces()
  if (existing.length > 0) return

  const palace = await createPalace('【Demo】《滕王阁序》第一段', 'dust2_blockout_v2')
  const updatedAt = nowIso()
  const cards: CardRecord[] = DEMO_CARDS.map((item, index) => {
    const routeIndex = index + 1
    return {
      palaceId: palace.id,
      locusId: locusIdFromRouteIndex(routeIndex),
      routeIndex,
      prompt: item.prompt,
      answer: item.answer,
      note: item.note,
      imageIds: [],
      confidence: undefined,
      lastReviewedAt: undefined,
      reviewCount: undefined,
      nextReviewAt: undefined,
      revealedCount: 0,
      updatedAt,
    }
  })
  await replaceCards(palace.id, cards)
}

/**
 * 学习指令：学习者写给 LLM 的要求，可以命名保存、修改、复制与删除。
 *
 * 六条内置示例是只读的起手式，定义在这里的前端常量里，永远不写进数据库：
 * 它们不占用户记录、不会被改名或删除，选用时只是把正文追加进输入框。
 */

/** 一条已保存的学习指令。 */
export type LearningInstruction = {
  id: string
  /** 列表里显示的名字，保存时去掉两端空白。 */
  name: string
  /** 指令正文，选用时原样追加到输入框。 */
  body: string
  /** ISO 8601 UTC。 */
  createdAt: string
  /** ISO 8601 UTC；改正文或重命名都会前移。 */
  updatedAt: string
}

export type LearningInstructionList = {
  /** 按更新时间倒序。 */
  instructions: LearningInstruction[]
}

/** 六条只读示例之一；`id` 只用于界面 key，不进数据库。 */
export type LearningInstructionExample = {
  id: string
  name: string
  body: string
}

export const LEARNING_INSTRUCTION_EXAMPLES: readonly LearningInstructionExample[] = [
  {
    id: 'meaning-usage',
    name: '词义与用法',
    body:
      '请结合我给的原句，说明这个词在这里的意思、常见搭配和用法；如果它还有别的常见义，也简单提一下。'
  },
  {
    id: 'examples',
    name: '例句',
    body:
      '请用这个词写三个不同场景的英文例句，每句后面给中文翻译，并标出这个词在句中的成分。'
  },
  {
    id: 'near-synonyms',
    name: '近义辨析',
    body:
      '请辨析这个词和它最接近的两三个近义词：在语气、搭配和使用场景上有什么不同，各配一个例句。'
  },
  {
    id: 'mnemonic',
    name: '助记',
    body:
      '请给这个词设计两三个好用的记忆方法，可以从词根、联想或常见搭配入手；不要编造词源。'
  },
  {
    id: 'polysemy',
    name: '多义词',
    body:
      '请列出这个词最常见的几个义项，按常用程度排序，每个义项给一个例子，并说明怎么区分。'
  },
  {
    id: 'generate-article',
    name: '生成文章',
    body:
      '请用这些词写一篇 200 词左右的英文短文，主题连贯、难度适合六级，把这些词自然放进去。只输出适合直接阅读的英文正文，不要标题、Markdown 标记、中文翻译或用法清单。'
  }
]

export type CreateLearningInstructionRequest = {
  name: string
  body: string
}

/** 改名与改正文走同一条更新：两样都带上，避免只改一半。 */
export type UpdateLearningInstructionRequest = {
  instructionId: string
  name: string
  body: string
}

export type CopyLearningInstructionRequest = {
  instructionId: string
}

export type DeleteLearningInstructionRequest = {
  instructionId: string
}

export type LearningInstructionRejection = 'empty-name' | 'empty-body'

export type LearningInstructionResult =
  | { status: 'saved'; instruction: LearningInstruction }
  | { status: 'deleted' }
  | { status: 'missing' }
  | { status: 'rejected'; reason: LearningInstructionRejection }

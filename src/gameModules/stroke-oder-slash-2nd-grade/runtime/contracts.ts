import type {
  AcquisitionStrategy,
  AcquisitionTarget,
  AcquisitionTargetSet,
} from '../../../acquisition/index.ts'

export type LearningGameId = 'stroke-oder-slash-2nd-grade'

export type LearningGameChannel = 'tier-1-writing' | 'tier-2-reading'
export type LearningGameSkill = 'writing' | 'reading' | 'receptive'
export type LearningGameInputKind = 'pairs' | 'selection' | 'context' | 'sequence' | 'production'

export type LearningGameDefinition = {
  readonly id: LearningGameId
  readonly title: string
  readonly description: string
  readonly activityLabel: string
  readonly channels: readonly LearningGameChannel[]
  readonly skills: readonly LearningGameSkill[]
  readonly inputKind: LearningGameInputKind
  readonly estimatedSeconds: readonly [minimum: number, maximum: number]
}

export type GamePrompt = {
  readonly id: string
  readonly targetId: string
  readonly targetText: string
  readonly cueText?: string
  readonly audioText?: string
}

export type StrokePoint = readonly [x: number, y: number]

export type StrokeOrderGameRound = GamePrompt & {
  readonly meaning: string
  readonly strokes: readonly (readonly StrokePoint[])[]
}

export type StrokeOrderAcquisitionTarget = AcquisitionTarget & {
  readonly strokeRoundId: string
}

export type StrokeOrderAcquisitionConfig = {
  readonly targetSet: AcquisitionTargetSet<StrokeOrderAcquisitionTarget>
  readonly strategy: AcquisitionStrategy<StrokeOrderAcquisitionTarget>
}

export type LearningGameAttempt = {
  readonly gameId: LearningGameId
  readonly promptId: string
  readonly targetId: string
  readonly correct: boolean
  readonly response: string | readonly string[]
  readonly assessmentMode: 'automatic' | 'self-assessment'
}

export type LearningGameSummary = {
  readonly gameId: LearningGameId
  readonly attempted: number
  readonly correct: number
  readonly attempts: readonly LearningGameAttempt[]
}

export type LearningGameBaseProps = {
  readonly title?: string
  readonly eyebrow?: string
  readonly onExit: () => void
  readonly onAttempt?: (attempt: LearningGameAttempt) => void
  readonly onComplete: (summary: LearningGameSummary) => void
}

export type PlayLearningAudio = (text: string, language?: string, playbackRate?: number) => void | Promise<void>

export type AcquisitionTarget = {
  id: string
  text: string
  sentence: string
  datasetId: string
  language?: 'mandarin' | 'english'
  tier?: 'tier-1' | 'tier-2' | 'tier-3'
  activityType?: 'dictation' | 'reading' | 'spelling'
}

export type AcquisitionTargetSet<TTarget extends AcquisitionTarget = AcquisitionTarget> = {
  id: string
  targets: readonly TTarget[]
}

export type AcquisitionSequenceToken = 'familiar-dt' | 'dt' | 'show-copy' | 'target'
export type AcquisitionPhase = 'introduction' | 'expanded-trials' | 'correction'
export type AcquisitionPromptKind = 'familiar-dt' | 'earned-dt' | 'show-copy' | 'target'
export type DistractorTrialPoolType = 'familiar' | 'earned'

export type AcquisitionCorrectionPolicy = {
  readonly assessmentMode: 'scored' | 'feedback-only'
  readonly finalExpandedFailure: 'complete-after-correction' | 'retry-target-after-correction'
}

export type AcquisitionTimerConfig = {
  familiarDtSeconds: number
  earnedDtSeconds: number
  introductionShowCopySeconds: number
  introductionHiddenTargetSeconds: number
  expandedStartSeconds: number
  expandedMinimumSeconds: number
  expandedDecrementSeconds: number
  correctionShowCopySeconds: number
  correctionHiddenSeconds: number
}

export type EngineAcquisitionPrompt<TTarget extends AcquisitionTarget = AcquisitionTarget> = {
  id: string
  kind: AcquisitionPromptKind
  phase: AcquisitionPhase
  word: TTarget
  targetWordId?: string
  scored: boolean
  countsTowardWeeklyScore: boolean
  dtPoolType?: DistractorTrialPoolType
  timerSeconds: number
  revealed: boolean
}

export type EngineAcquisitionFlow<TTarget extends AcquisitionTarget = AcquisitionTarget> = {
  datasetId: string
  strategyId: string
  strategyVersion: number
  mode: 'teaching' | 'dt-practice'
  targetIndex: number
  currentTarget: TTarget | null
  phase: AcquisitionPhase
  step: number
  trialNumber: number
  expandedTargetAttempts: number
  earnedDtPool: TTarget[]
  familiarDtBag: TTarget[]
  /** Legacy persisted field accepted only while migrating pre-v3 progress. */
  establishedDtBag?: TTarget[]
  earnedDtBag: TTarget[]
  lastDtWordId?: string
  consecutiveErrors: Record<string, number>
  correctionRole?: 'current-target' | 'earned-dt'
  resumePosition?: { phase: 'expanded-trials'; step: number; expandedTargetAttempts: number; currentTarget: TTarget; targetIndex: number }
  prompt: EngineAcquisitionPrompt<TTarget> | null
  teachingComplete: boolean
  complete: boolean
}

export type AcquisitionStrategy<TTarget extends AcquisitionTarget = AcquisitionTarget> = {
  readonly id: string
  readonly version: number
  readonly timers: AcquisitionTimerConfig
  readonly dtObservationMode: 'collect' | 'discard'
  readonly correctionPolicy?: AcquisitionCorrectionPolicy
  readonly familiarDtTargets: readonly TTarget[]
  readonly introductionSequence: readonly AcquisitionSequenceToken[]
  readonly expandedSequence: readonly AcquisitionSequenceToken[]
  readonly correctionSequence: readonly AcquisitionSequenceToken[]
}

export type AcquisitionResponse<TRevealMethod extends string = string> = {
  readonly correct: boolean
  readonly revealMethod: TRevealMethod
}

export type AcquisitionAssessment<
  TTarget extends AcquisitionTarget = AcquisitionTarget,
  TRevealMethod extends string = string,
> = {
  readonly promptId: string
  readonly targetOccurrenceId: string
  readonly target: TTarget
  readonly kind: AcquisitionPromptKind
  readonly correct: boolean
  readonly countsTowardWeeklyScore: boolean
  readonly dtPoolType?: DistractorTrialPoolType
  readonly revealMethod: TRevealMethod
}

export type AcquisitionTransition<
  TTarget extends AcquisitionTarget = AcquisitionTarget,
  TRevealMethod extends string = string,
> = {
  readonly nextFlow: EngineAcquisitionFlow<TTarget>
  readonly assessment?: AcquisitionAssessment<TTarget, TRevealMethod>
}

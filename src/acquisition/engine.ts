import type {
  AcquisitionPhase,
  AcquisitionPromptKind,
  AcquisitionSequenceToken,
  AcquisitionStrategy,
  AcquisitionTarget,
  AcquisitionTargetSet,
  EngineAcquisitionFlow,
  EngineAcquisitionPrompt,
} from './contracts.ts'

function shuffleTargets<TTarget>(targets: readonly TTarget[], random: () => number) {
  const output = [...targets]
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[output[index], output[swapIndex]] = [output[swapIndex], output[index]]
  }
  return output
}

function drawFromBag<TTarget extends AcquisitionTarget>(targets: readonly TTarget[], bag: TTarget[], lastDtWordId: string | undefined, random: () => number) {
  const eligibleIds = new Set(targets.map((target) => target.id))
  let nextBag = bag.filter((target) => eligibleIds.has(target.id))
  if (nextBag.length === 0) nextBag = shuffleTargets(targets, random)
  if (nextBag.length > 1 && nextBag[0].id === lastDtWordId) {
    const alternativeIndex = nextBag.findIndex((target) => target.id !== lastDtWordId)
    if (alternativeIndex > 0) [nextBag[0], nextBag[alternativeIndex]] = [nextBag[alternativeIndex], nextBag[0]]
  }
  const [word, ...remaining] = nextBag
  return { word, bag: remaining }
}

function bagCanAvoidRepeat<TTarget extends AcquisitionTarget>(targets: readonly TTarget[], bag: TTarget[], lastDtWordId: string | undefined) {
  const eligibleIds = new Set(targets.map((target) => target.id))
  const activeBag = bag.filter((target) => eligibleIds.has(target.id))
  const candidates = activeBag.length > 0 ? activeBag : targets
  return candidates.some((target) => target.id !== lastDtWordId)
}

export function acquisitionPromptTimer<TTarget extends AcquisitionTarget>(strategy: AcquisitionStrategy<TTarget>, phase: AcquisitionPhase, kind: AcquisitionPromptKind, expandedTargetAttempts: number) {
  const config = strategy.timers
  if (kind === 'familiar-dt') return config.familiarDtSeconds
  if (kind === 'earned-dt') return config.earnedDtSeconds
  if (kind === 'show-copy') return phase === 'correction' ? config.correctionShowCopySeconds : config.introductionShowCopySeconds
  if (phase === 'introduction') return config.introductionHiddenTargetSeconds
  if (phase === 'correction') return config.correctionHiddenSeconds
  return Math.max(config.expandedMinimumSeconds, config.expandedStartSeconds - expandedTargetAttempts * config.expandedDecrementSeconds)
}

function feedbackOnlyCorrection<TTarget extends AcquisitionTarget>(strategy: AcquisitionStrategy<TTarget>, phase: AcquisitionPhase) {
  return phase === 'correction' && strategy.correctionPolicy?.assessmentMode === 'feedback-only'
}

function makeAcquisitionPrompt<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, strategy: AcquisitionStrategy<TTarget>, kind: AcquisitionPromptKind, word: TTarget, targetWordId?: string): EngineAcquisitionFlow<TTarget> {
  const trialNumber = flow.trialNumber + 1
  const earnedDtTrial = kind === 'earned-dt' || (kind === 'target' && flow.correctionRole === 'earned-dt')
  const weeklyTarget = (kind === 'target' || earnedDtTrial) && !feedbackOnlyCorrection(strategy, flow.phase)
  const dtPoolType = kind === 'familiar-dt' ? 'familiar' as const : earnedDtTrial ? 'earned' as const : undefined
  return {
    ...flow,
    trialNumber,
    prompt: {
      id: `${flow.datasetId}-${flow.targetIndex}-${flow.phase}-${flow.step}-${trialNumber}-${kind}-${word.id}`,
      kind,
      phase: flow.phase,
      word,
      targetWordId,
      scored: weeklyTarget,
      countsTowardWeeklyScore: weeklyTarget,
      dtPoolType,
      timerSeconds: acquisitionPromptTimer(strategy, flow.phase, kind, flow.expandedTargetAttempts),
      revealed: false,
    },
  }
}

function familiarDtPrompt<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  const drawn = drawFromBag(strategy.familiarDtTargets, flow.familiarDtBag, flow.lastDtWordId, random)
  return makeAcquisitionPrompt({ ...flow, familiarDtBag: drawn.bag, lastDtWordId: drawn.word.id }, strategy, 'familiar-dt', drawn.word)
}

function dtPrompt<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  // An Earned DT that has lost earned status is itself being retaught while
  // resumePosition preserves the interrupted weekly target. Restrict the DT
  // slots in that reacquisition sequence to Familiar DTs so another Earned DT
  // cannot replace the one available resume position or recursively interrupt
  // the reacquisition routine.
  if (flow.correctionRole === 'earned-dt') return familiarDtPrompt(flow, strategy, random)
  const preferEarned = flow.earnedDtPool.length > 0 && random() >= 0.5
  const earnedCanAvoidRepeat = bagCanAvoidRepeat(flow.earnedDtPool, flow.earnedDtBag, flow.lastDtWordId)
  if (preferEarned && earnedCanAvoidRepeat) {
    const drawn = drawFromBag(flow.earnedDtPool, flow.earnedDtBag, flow.lastDtWordId, random)
    const resumePosition = flow.mode === 'teaching' && flow.phase === 'expanded-trials' && flow.currentTarget
      ? { phase: 'expanded-trials' as const, step: flow.step + 1, expandedTargetAttempts: flow.expandedTargetAttempts, currentTarget: flow.currentTarget, targetIndex: flow.targetIndex }
      : flow.resumePosition
    return makeAcquisitionPrompt({ ...flow, earnedDtBag: drawn.bag, lastDtWordId: drawn.word.id, resumePosition }, strategy, 'earned-dt', drawn.word, drawn.word.id)
  }
  return familiarDtPrompt(flow, strategy, random)
}

function coreAcquisitionPrompt<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number): EngineAcquisitionFlow<TTarget> {
  if (flow.mode === 'dt-practice' && !flow.currentTarget) return dtPrompt({ ...flow, complete: false }, strategy, random)
  if (!flow.currentTarget) return { ...flow, prompt: null, complete: true }
  const token = flow.phase === 'introduction' ? strategy.introductionSequence[flow.step] : flow.phase === 'expanded-trials' ? strategy.expandedSequence[flow.step] : strategy.correctionSequence[flow.step]
  if (!token) return flow
  if (token === 'familiar-dt') return familiarDtPrompt(flow, strategy, random)
  if (token === 'dt') return dtPrompt(flow, strategy, random)
  if (token === 'show-copy') return makeAcquisitionPrompt(flow, strategy, 'show-copy', flow.currentTarget, flow.currentTarget.id)
  return makeAcquisitionPrompt(flow, strategy, 'target', flow.currentTarget, flow.currentTarget.id)
}

export function startAcquisition<TTarget extends AcquisitionTarget>(targetSet: AcquisitionTargetSet<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number): EngineAcquisitionFlow<TTarget> {
  const currentTarget = targetSet.targets[0] || null
  return coreAcquisitionPrompt({
    datasetId: targetSet.id,
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    mode: 'teaching',
    targetIndex: 0,
    currentTarget,
    phase: 'introduction',
    step: 0,
    trialNumber: 0,
    expandedTargetAttempts: 0,
    earnedDtPool: [],
    familiarDtBag: [],
    earnedDtBag: [],
    consecutiveErrors: {},
    prompt: null,
    teachingComplete: !currentTarget,
    complete: !currentTarget,
  }, strategy, random)
}

export function resumeAcquisition<TTarget extends AcquisitionTarget>(saved: EngineAcquisitionFlow<TTarget> | undefined, targetSet: AcquisitionTargetSet<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  if (!saved || saved.datasetId !== targetSet.id) return startAcquisition(targetSet, strategy, random)
  const normalized = normalizePersistedAcquisitionFlow(saved, strategy, random)
  if (normalized.complete || normalized.teachingComplete) return coreAcquisitionPrompt({ ...normalized, mode: 'dt-practice', currentTarget: null, prompt: null, teachingComplete: true, complete: false, correctionRole: undefined, resumePosition: undefined }, strategy, random)
  return normalized
}

const legacyExpandedStepMap = [0, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

function migratedExpandedStep(step: number) {
  return legacyExpandedStepMap[Math.max(0, Math.min(step, legacyExpandedStepMap.length - 1))]
}

function completedExpandedTargets<TTarget extends AcquisitionTarget>(strategy: AcquisitionStrategy<TTarget>, step: number) {
  return strategy.expandedSequence.slice(0, step).filter((token) => token === 'target').length
}

function canonicalFamiliarTarget<TTarget extends AcquisitionTarget>(target: TTarget, strategy: AcquisitionStrategy<TTarget>) {
  if (target.datasetId !== '__established-dt__' && !target.id.startsWith('established-dt-')) return target
  const byText = strategy.familiarDtTargets.find((candidate) => candidate.text === target.text)
  if (byText) return byText
  const suffix = target.id.match(/(\d+)$/)?.[1]
  return (strategy.familiarDtTargets.find((candidate) => candidate.id.endsWith(`-${suffix}`)) || target) as TTarget
}

function canonicalFamiliarId<TTarget extends AcquisitionTarget>(wordId: string | undefined, strategy: AcquisitionStrategy<TTarget>) {
  if (!wordId?.startsWith('established-dt-')) return wordId
  const suffix = wordId.match(/(\d+)$/)?.[1]
  return strategy.familiarDtTargets.find((candidate) => candidate.id.endsWith(`-${suffix}`))?.id || wordId
}

type LegacyAcquisitionPrompt<TTarget extends AcquisitionTarget> = Omit<EngineAcquisitionPrompt<TTarget>, 'kind' | 'dtPoolType'> & {
  kind: AcquisitionPromptKind | 'established-dt'
  dtPoolType?: EngineAcquisitionPrompt<TTarget>['dtPoolType'] | 'established'
}

function sequenceTokenAt<TTarget extends AcquisitionTarget>(phase: AcquisitionPhase, step: number, strategy: AcquisitionStrategy<TTarget>) {
  return phase === 'introduction'
    ? strategy.introductionSequence[step]
    : phase === 'expanded-trials'
      ? strategy.expandedSequence[step]
      : strategy.correctionSequence[step]
}

function promptMatchesToken(kind: AcquisitionPromptKind, token: AcquisitionSequenceToken | undefined) {
  if (token === 'dt') return kind === 'familiar-dt' || kind === 'earned-dt'
  return kind === token
}

function migratePendingPrompt<TTarget extends AcquisitionTarget>(saved: EngineAcquisitionFlow<TTarget>, phase: AcquisitionPhase, step: number, expandedTargetAttempts: number, strategy: AcquisitionStrategy<TTarget>) {
  if (!saved.prompt) return null
  const legacyPrompt = saved.prompt as LegacyAcquisitionPrompt<TTarget>
  const kind = legacyPrompt.kind === 'established-dt' ? 'familiar-dt' : legacyPrompt.kind
  if (!promptMatchesToken(kind, sequenceTokenAt(phase, step, strategy))) return null
  return {
    ...legacyPrompt,
    kind,
    word: canonicalFamiliarTarget(legacyPrompt.word, strategy),
    targetWordId: canonicalFamiliarId(legacyPrompt.targetWordId, strategy),
    dtPoolType: legacyPrompt.dtPoolType === 'established' ? 'familiar' as const : legacyPrompt.dtPoolType,
    timerSeconds: acquisitionPromptTimer(strategy, phase, kind, expandedTargetAttempts),
    revealed: false,
  } satisfies EngineAcquisitionPrompt<TTarget>
}

export function normalizePersistedAcquisitionFlow<TTarget extends AcquisitionTarget>(saved: EngineAcquisitionFlow<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  if (saved.strategyId === strategy.id && saved.strategyVersion === strategy.version && Array.isArray(saved.familiarDtBag)) return saved
  const legacy = saved as EngineAcquisitionFlow<TTarget> & { establishedDtBag?: TTarget[] }
  const step = saved.phase === 'expanded-trials'
    ? migratedExpandedStep(saved.step)
    : saved.phase === 'correction'
      ? 0
      : Math.max(0, Math.min(saved.step, strategy.introductionSequence.length - 1))
  const resumePosition = saved.resumePosition ? {
    ...saved.resumePosition,
    step: migratedExpandedStep(saved.resumePosition.step),
    expandedTargetAttempts: completedExpandedTargets(strategy, migratedExpandedStep(saved.resumePosition.step)),
  } : undefined
  const expandedTargetAttempts = saved.phase === 'expanded-trials' ? completedExpandedTargets(strategy, step) : 0
  const prompt = migratePendingPrompt(saved, saved.phase, step, expandedTargetAttempts, strategy)
  const migrated: EngineAcquisitionFlow<TTarget> = {
    datasetId: saved.datasetId,
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    mode: saved.mode,
    targetIndex: saved.targetIndex,
    currentTarget: saved.currentTarget,
    phase: saved.phase,
    step,
    trialNumber: saved.trialNumber,
    expandedTargetAttempts,
    earnedDtPool: saved.earnedDtPool,
    familiarDtBag: (saved.familiarDtBag || legacy.establishedDtBag || []).map((target) => canonicalFamiliarTarget(target, strategy)),
    earnedDtBag: saved.earnedDtBag,
    lastDtWordId: canonicalFamiliarId(saved.lastDtWordId, strategy),
    consecutiveErrors: saved.consecutiveErrors,
    correctionRole: saved.correctionRole,
    resumePosition,
    prompt,
    teachingComplete: saved.teachingComplete,
    complete: saved.complete,
  }
  if (migrated.complete || migrated.teachingComplete) return migrated
  if (migrated.prompt) return migrated
  return coreAcquisitionPrompt(migrated, strategy, random)
}

function withEarnedWord<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, word: TTarget) {
  return flow.earnedDtPool.some((candidate) => candidate.id === word.id) ? flow : { ...flow, earnedDtPool: [...flow.earnedDtPool, word] }
}

function withoutEarnedWord<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, wordId: string) {
  return { ...flow, earnedDtPool: flow.earnedDtPool.filter((word) => word.id !== wordId), earnedDtBag: flow.earnedDtBag.filter((word) => word.id !== wordId) }
}

function resumeInterruptedTarget<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  const resume = flow.resumePosition
  if (!resume) return coreAcquisitionPrompt({ ...flow, mode: 'dt-practice', currentTarget: null, correctionRole: undefined, prompt: null, complete: false }, strategy, random)
  return coreAcquisitionPrompt({ ...flow, mode: 'teaching', targetIndex: resume.targetIndex, currentTarget: resume.currentTarget, phase: resume.phase, step: resume.step, expandedTargetAttempts: resume.expandedTargetAttempts, correctionRole: undefined, resumePosition: undefined, prompt: null }, strategy, random)
}

function advanceToNextTarget<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, targetSet: AcquisitionTargetSet<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  const nextIndex = flow.targetIndex + 1
  if (nextIndex >= targetSet.targets.length) return { ...flow, currentTarget: null, prompt: null, teachingComplete: true, complete: true, correctionRole: undefined, resumePosition: undefined }
  return coreAcquisitionPrompt({ ...flow, targetIndex: nextIndex, currentTarget: targetSet.targets[nextIndex], phase: 'introduction', step: 0, expandedTargetAttempts: 0, correctionRole: undefined, resumePosition: undefined, prompt: null, complete: false }, strategy, random)
}

function completeCurrentTarget<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, targetSet: AcquisitionTargetSet<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  const target = flow.currentTarget
  if (!target) return { ...flow, prompt: null, complete: true }
  const earned = withEarnedWord(flow, target)
  return flow.correctionRole === 'earned-dt' ? resumeInterruptedTarget(earned, strategy, random) : advanceToNextTarget(earned, targetSet, strategy, random)
}

function errorsAfter<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, wordId: string, correct: boolean) {
  return { ...flow.consecutiveErrors, [wordId]: correct ? 0 : (flow.consecutiveErrors[wordId] || 0) + 1 }
}

function restartIntroduction<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, word: TTarget, role: 'current-target' | 'earned-dt', strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  const restarted = role === 'earned-dt' ? withoutEarnedWord(flow, word.id) : flow
  return coreAcquisitionPrompt({ ...restarted, currentTarget: word, phase: 'introduction', step: 0, expandedTargetAttempts: 0, correctionRole: role, prompt: null }, strategy, random)
}

/**
 * Restart only the active target's teaching introduction after a strategy
 * upgrade changes the meaning of an in-progress sequence position. Completed
 * targets, earned DTs, error history, and an interrupted target resume point
 * are preserved.
 */
export function restartCurrentAcquisitionIntroduction<TTarget extends AcquisitionTarget>(
  flow: EngineAcquisitionFlow<TTarget>,
  strategy: AcquisitionStrategy<TTarget>,
  random: () => number,
) {
  if (!flow.currentTarget || flow.teachingComplete) return {
    ...flow,
    strategyId: strategy.id,
    strategyVersion: strategy.version,
  }
  const current = {
    ...flow,
    strategyId: strategy.id,
    strategyVersion: strategy.version,
  }
  return restartIntroduction(
    current,
    flow.currentTarget,
    flow.correctionRole === 'earned-dt' ? 'earned-dt' : 'current-target',
    strategy,
    random,
  )
}

function enterCorrection<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, word: TTarget, role: 'current-target' | 'earned-dt', resumePosition: EngineAcquisitionFlow<TTarget>['resumePosition'], strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  return coreAcquisitionPrompt({ ...flow, currentTarget: word, phase: 'correction', step: 0, correctionRole: role, resumePosition, prompt: null }, strategy, random)
}

function advanceUnscoredOrFamiliarDt<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  if (flow.mode === 'dt-practice' && !flow.currentTarget) return coreAcquisitionPrompt({ ...flow, prompt: null }, strategy, random)
  return coreAcquisitionPrompt({ ...flow, step: flow.step + 1, prompt: null }, strategy, random)
}

export function revealAcquisition<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>) {
  if (!flow.prompt) return flow
  return { ...flow, prompt: { ...flow.prompt, revealed: true } }
}

export function answerAcquisition<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, targetSet: AcquisitionTargetSet<TTarget>, strategy: AcquisitionStrategy<TTarget>, correct: boolean, random: () => number): EngineAcquisitionFlow<TTarget> {
  const prompt = flow.prompt
  if (!prompt || !prompt.revealed) return flow
  if (prompt.kind === 'show-copy' || prompt.kind === 'familiar-dt') return advanceUnscoredOrFamiliarDt(flow, strategy, random)

  const correctionIsFeedbackOnly = feedbackOnlyCorrection(strategy, flow.phase)
  const consecutiveErrors = correctionIsFeedbackOnly
    ? flow.consecutiveErrors
    : errorsAfter(flow, prompt.word.id, correct)
  const updated = { ...flow, consecutiveErrors }

  if (prompt.kind === 'earned-dt') {
    if (correct) return flow.mode === 'dt-practice' ? coreAcquisitionPrompt({ ...updated, prompt: null }, strategy, random) : resumeInterruptedTarget(updated, strategy, random)
    if (consecutiveErrors[prompt.word.id] >= 3) return restartIntroduction(updated, prompt.word, 'earned-dt', strategy, random)
    return enterCorrection(updated, prompt.word, 'earned-dt', flow.resumePosition, strategy, random)
  }

  if (!correct && !correctionIsFeedbackOnly && consecutiveErrors[prompt.word.id] >= 3) return restartIntroduction(updated, prompt.word, flow.correctionRole === 'earned-dt' ? 'earned-dt' : 'current-target', strategy, random)

  if (flow.phase === 'introduction') {
    if (correct) return coreAcquisitionPrompt({ ...updated, phase: 'expanded-trials', step: 0, expandedTargetAttempts: 0, prompt: null }, strategy, random)
    const resumePosition = { phase: 'expanded-trials' as const, step: 0, expandedTargetAttempts: 0, currentTarget: prompt.word, targetIndex: flow.targetIndex }
    return enterCorrection(updated, prompt.word, flow.correctionRole === 'earned-dt' ? 'earned-dt' : 'current-target', resumePosition, strategy, random)
  }

  if (flow.phase === 'expanded-trials') {
    const expandedTargetAttempts = flow.expandedTargetAttempts + 1
    const nextStep = flow.step + 1
    if (!correct) {
      const retryFinalTarget = nextStep >= strategy.expandedSequence.length
        && strategy.correctionPolicy?.finalExpandedFailure === 'retry-target-after-correction'
      const resumePosition = {
        phase: 'expanded-trials' as const,
        step: retryFinalTarget ? flow.step : nextStep,
        expandedTargetAttempts: retryFinalTarget ? flow.expandedTargetAttempts : expandedTargetAttempts,
        currentTarget: prompt.word,
        targetIndex: flow.targetIndex,
      }
      return enterCorrection(
        retryFinalTarget ? updated : { ...updated, expandedTargetAttempts },
        prompt.word,
        flow.correctionRole === 'earned-dt' ? 'earned-dt' : 'current-target',
        resumePosition,
        strategy,
        random,
      )
    }
    return nextStep >= strategy.expandedSequence.length
      ? completeCurrentTarget({ ...updated, expandedTargetAttempts, prompt: null }, targetSet, strategy, random)
      : coreAcquisitionPrompt({ ...updated, step: nextStep, expandedTargetAttempts, prompt: null }, strategy, random)
  }

  const finalCorrectionStep = strategy.correctionSequence.length - 1
  if (flow.step < finalCorrectionStep) return coreAcquisitionPrompt({ ...updated, step: flow.step + 1, prompt: null }, strategy, random)
  if (correct) {
    if (flow.correctionRole === 'earned-dt') return resumeInterruptedTarget(withEarnedWord(updated, prompt.word), strategy, random)
    const resume = updated.resumePosition
    if (!resume) return coreAcquisitionPrompt({ ...updated, phase: 'expanded-trials', step: 0, expandedTargetAttempts: 0, correctionRole: undefined, prompt: null }, strategy, random)
    if (resume.step >= strategy.expandedSequence.length) {
      return completeCurrentTarget({ ...updated, targetIndex: resume.targetIndex, currentTarget: resume.currentTarget, phase: resume.phase, step: resume.step, expandedTargetAttempts: resume.expandedTargetAttempts, correctionRole: undefined, resumePosition: undefined, prompt: null }, targetSet, strategy, random)
    }
    return resumeInterruptedTarget(updated, strategy, random)
  }
  return coreAcquisitionPrompt({ ...updated, step: 0, prompt: null }, strategy, random)
}

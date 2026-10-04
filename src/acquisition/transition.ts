import type {
  AcquisitionResponse,
  AcquisitionStrategy,
  AcquisitionTarget,
  AcquisitionTargetSet,
  AcquisitionTransition,
  EngineAcquisitionFlow,
} from './contracts.ts'
import { answerAcquisition } from './engine.ts'

export function transitionAcquisition<
  TTarget extends AcquisitionTarget,
  TRevealMethod extends string,
>(
  flow: EngineAcquisitionFlow<TTarget>,
  targetSet: AcquisitionTargetSet<TTarget>,
  strategy: AcquisitionStrategy<TTarget>,
  response: AcquisitionResponse<TRevealMethod>,
  random: () => number,
): AcquisitionTransition<TTarget, TRevealMethod> {
  const answeredPrompt = flow.prompt
  if (!answeredPrompt || !answeredPrompt.revealed) return { nextFlow: flow }

  const nextFlow = answerAcquisition(flow, targetSet, strategy, response.correct, random)
  if (answeredPrompt.kind === 'show-copy') return { nextFlow }

  return {
    nextFlow,
    assessment: {
      promptId: answeredPrompt.id,
      targetOccurrenceId: answeredPrompt.word.id,
      target: answeredPrompt.word,
      kind: answeredPrompt.kind,
      correct: response.correct,
      countsTowardWeeklyScore: answeredPrompt.countsTowardWeeklyScore,
      dtPoolType: answeredPrompt.dtPoolType,
      revealMethod: response.revealMethod,
    },
  }
}

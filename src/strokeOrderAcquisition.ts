import type { AcquisitionSequenceToken } from './acquisition'

/**
 * Stroke-order teaching must model a new character before asking the learner
 * to recall anything. The engine returns to step 0 for every new target, so
 * keeping show-copy first guarantees one opening demonstration per character.
 */
export const strokeOrderIntroductionSequence = [
  'show-copy',
  'familiar-dt',
  'familiar-dt',
  'target',
] as const satisfies readonly AcquisitionSequenceToken[]

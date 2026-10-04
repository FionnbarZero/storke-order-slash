import assert from 'node:assert/strict'
import test from 'node:test'
import {
  grade2AcquisitionStrategy,
  revealAcquisition,
  startAcquisition,
  transitionAcquisition,
  type AcquisitionStrategy,
  type AcquisitionTarget,
  type AcquisitionTargetSet,
  type EngineAcquisitionFlow,
} from '../src/acquisition/index.ts'
import { strokeOrderIntroductionSequence } from '../src/strokeOrderAcquisition.ts'
import { gameManifest as originalGameManifest } from '../src/gameModules/stroke-order-slay/manifest.ts'
import { gameManifest as secondGradeGameManifest } from '../src/gameModules/stroke-oder-slash-2nd-grade/manifest.ts'
import { secondGradeWritingTargets } from '../src/gameModules/stroke-oder-slash-2nd-grade/curriculum.ts'

const targets: AcquisitionTarget[] = [
  {
    id: 'stroke-target-one',
    text: '木',
    sentence: '',
    datasetId: 'stroke-acquisition-test',
    language: 'mandarin',
    tier: 'tier-1',
    activityType: 'dictation',
  },
  {
    id: 'stroke-target-two',
    text: '林',
    sentence: '',
    datasetId: 'stroke-acquisition-test',
    language: 'mandarin',
    tier: 'tier-1',
    activityType: 'dictation',
  },
]

const targetSet: AcquisitionTargetSet = {
  id: 'stroke-acquisition-test',
  targets,
}

function review(
  flow: EngineAcquisitionFlow,
  strategy: AcquisitionStrategy = grade2AcquisitionStrategy,
  correct = true,
  random: () => number = () => 0,
) {
  return transitionAcquisition(
    revealAcquisition(flow),
    targetSet,
    strategy,
    { correct, revealMethod: 'manual-compare' },
    random,
  )
}

function advance(
  flow: EngineAcquisitionFlow,
  strategy: AcquisitionStrategy = grade2AcquisitionStrategy,
  correct = true,
  random: () => number = () => 0,
) {
  return review(flow, strategy, correct, random).nextFlow
}

test('the extracted Grade 2 v4 strategy preserves the complete first-target prompt trace', () => {
  let flow = startAcquisition(targetSet, grade2AcquisitionStrategy, () => 0)
  const trace: Array<{ kind: string | undefined; timer: number | undefined }> = []

  while (flow.targetIndex === 0 && !flow.complete) {
    trace.push({ kind: flow.prompt?.kind, timer: flow.prompt?.timerSeconds })
    flow = advance(flow)
  }

  assert.deepEqual(trace, [
    { kind: 'familiar-dt', timer: 5 },
    { kind: 'familiar-dt', timer: 5 },
    { kind: 'show-copy', timer: 10 },
    { kind: 'target', timer: 10 },
    { kind: 'target', timer: 10 },
    { kind: 'target', timer: 9 },
    { kind: 'familiar-dt', timer: 5 },
    { kind: 'target', timer: 8 },
    { kind: 'familiar-dt', timer: 5 },
    { kind: 'familiar-dt', timer: 5 },
    { kind: 'target', timer: 7 },
    { kind: 'familiar-dt', timer: 5 },
    { kind: 'familiar-dt', timer: 5 },
    { kind: 'familiar-dt', timer: 5 },
    { kind: 'target', timer: 6 },
  ])
  assert.equal(flow.targetIndex, 1)
  assert.deepEqual(flow.earnedDtPool.map((target) => target.id), ['stroke-target-one'])
})

test('stroke-order Acquisition demonstrates every new character first', () => {
  const strategy = {
    ...grade2AcquisitionStrategy,
    id: 'stroke-order-test-v2',
    version: 2,
    introductionSequence: strokeOrderIntroductionSequence,
  } as const satisfies AcquisitionStrategy

  let flow = startAcquisition(targetSet, strategy, () => 0)
  assert.equal(flow.targetIndex, 0)
  assert.equal(flow.phase, 'introduction')
  assert.equal(flow.prompt?.kind, 'show-copy')
  assert.equal(flow.prompt?.word.id, targets[0].id)

  while (flow.targetIndex === 0 && !flow.complete) flow = advance(flow, strategy)

  assert.equal(flow.targetIndex, 1)
  assert.equal(flow.phase, 'introduction')
  assert.equal(flow.prompt?.kind, 'show-copy')
  assert.equal(flow.prompt?.word.id, targets[1].id)
})

test('the second-grade copy is registered as a distinct game module', () => {
  assert.equal(secondGradeGameManifest.id, 'stroke-oder-slash-2nd-grade')
  assert.equal(secondGradeGameManifest.title, 'Stroke Oder Slash 2nd grade')
  assert.notEqual(secondGradeGameManifest.id, originalGameManifest.id)
})

test('the supplied Grade 2 targets each begin with a stroke-order demonstration', () => {
  const grade2Targets: AcquisitionTarget[] = secondGradeWritingTargets.map((target) => ({
    id: `grade2-${target.id}`,
    text: target.text,
    sentence: '',
    datasetId: 'grade2-week-0921-test',
    language: 'mandarin',
    tier: 'tier-1',
    activityType: 'dictation',
  }))
  const grade2TargetSet: AcquisitionTargetSet = {
    id: 'grade2-week-0921-test',
    targets: grade2Targets,
  }
  const strategy = {
    ...grade2AcquisitionStrategy,
    id: 'stroke-order-grade2-target-test',
    version: 1,
    introductionSequence: strokeOrderIntroductionSequence,
  } as const satisfies AcquisitionStrategy

  let flow = startAcquisition(grade2TargetSet, strategy, () => 0)
  for (const [targetIndex, target] of grade2Targets.entries()) {
    assert.equal(flow.targetIndex, targetIndex)
    assert.equal(flow.phase, 'introduction')
    assert.equal(flow.prompt?.kind, 'show-copy')
    assert.equal(flow.prompt?.word.text, target.text)

    while (!flow.complete && flow.targetIndex === targetIndex) {
      flow = transitionAcquisition(
        revealAcquisition(flow),
        grade2TargetSet,
        strategy,
        { correct: true, revealMethod: 'test' },
        () => 0,
      ).nextFlow
    }
  }

  assert.equal(flow.complete, true)
  assert.deepEqual(grade2Targets.map((target) => target.text), ['比如', '部分', '更', '方便', '美好'])
})

test('a reviewed prompt returns an assessment for the answered prompt', () => {
  const flow = startAcquisition(targetSet, grade2AcquisitionStrategy, () => 0)
  const answeredPrompt = flow.prompt
  const transition = review(flow, grade2AcquisitionStrategy, false)

  assert.equal(transition.assessment?.promptId, answeredPrompt?.id)
  assert.equal(transition.assessment?.kind, 'familiar-dt')
  assert.equal(transition.assessment?.correct, false)
  assert.equal(transition.assessment?.countsTowardWeeklyScore, false)
  assert.equal(transition.assessment?.dtPoolType, 'familiar')
  assert.equal(transition.assessment?.revealMethod, 'manual-compare')
  assert.notEqual(transition.nextFlow.prompt?.id, answeredPrompt?.id)
})

test('the optional feedback-only policy retries a failed final Expanded target after Correction', () => {
  const strategy = {
    ...grade2AcquisitionStrategy,
    id: 'stroke-acquisition-feedback-v1',
    version: 1,
    correctionPolicy: {
      assessmentMode: 'feedback-only',
      finalExpandedFailure: 'retry-target-after-correction',
    },
  } as const satisfies AcquisitionStrategy

  let flow = startAcquisition(targetSet, strategy, () => 0)
  while (!(flow.phase === 'expanded-trials' && flow.step === 10)) flow = advance(flow, strategy)
  assert.equal(flow.prompt?.kind, 'target')
  assert.equal(flow.expandedTargetAttempts, 4)

  const failedFinal = review(flow, strategy, false)
  flow = failedFinal.nextFlow
  assert.equal(failedFinal.assessment?.countsTowardWeeklyScore, true)
  assert.equal(flow.phase, 'correction')
  assert.equal(flow.resumePosition?.step, 10)
  assert.equal(flow.resumePosition?.expandedTargetAttempts, 4)
  assert.equal(flow.consecutiveErrors['stroke-target-one'], 1)

  flow = advance(flow, strategy)
  flow = advance(flow, strategy)
  flow = advance(flow, strategy)
  assert.equal(flow.prompt?.kind, 'target')
  assert.equal(flow.prompt?.countsTowardWeeklyScore, false)

  flow = advance(flow, strategy, false)
  assert.equal(flow.consecutiveErrors['stroke-target-one'], 1)
  flow = advance(flow, strategy)
  assert.equal(flow.prompt?.kind, 'target')
  assert.equal(flow.prompt?.countsTowardWeeklyScore, false)

  flow = advance(flow, strategy)
  assert.equal(flow.phase, 'expanded-trials')
  assert.equal(flow.step, 10)
  assert.equal(flow.prompt?.kind, 'target')
  assert.equal(flow.prompt?.timerSeconds, 6)

  flow = advance(flow, strategy)
  assert.equal(flow.targetIndex, 1)
})

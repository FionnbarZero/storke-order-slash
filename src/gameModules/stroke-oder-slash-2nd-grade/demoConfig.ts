import oneData from 'hanzi-writer-data/一.json'
import twoData from 'hanzi-writer-data/二.json'
import threeData from 'hanzi-writer-data/三.json'
import exampleBiData from 'hanzi-writer-data/比.json'
import exampleRuData from 'hanzi-writer-data/如.json'
import partBuData from 'hanzi-writer-data/部.json'
import partFenData from 'hanzi-writer-data/分.json'
import moreData from 'hanzi-writer-data/更.json'
import convenientFangData from 'hanzi-writer-data/方.json'
import convenientBianData from 'hanzi-writer-data/便.json'
import beautifulMeiData from 'hanzi-writer-data/美.json'
import beautifulHaoData from 'hanzi-writer-data/好.json'
import {
  grade2AcquisitionStrategy,
  type AcquisitionStrategy,
  type AcquisitionTargetSet,
} from '../../acquisition'
import { strokeOrderIntroductionSequence } from '../../strokeOrderAcquisition'
import { secondGradeTargetTimerOverrides, secondGradeWritingTargets } from './curriculum'
import type {
  StrokeOrderAcquisitionConfig,
  StrokeOrderAcquisitionTarget,
  StrokeOrderGameRound,
  StrokePoint,
} from './runtime/contracts'

type HanziWriterCharacterData = {
  readonly medians: readonly (readonly (readonly number[])[])[]
}

const characterData: Readonly<Record<string, HanziWriterCharacterData>> = {
  一: oneData,
  二: twoData,
  三: threeData,
  比: exampleBiData,
  如: exampleRuData,
  部: partBuData,
  分: partFenData,
  更: moreData,
  方: convenientFangData,
  便: convenientBianData,
  美: beautifulMeiData,
  好: beautifulHaoData,
}

const cellSize = 100
const characterScale = .09
const characterInset = 5
const hanziBaseline = 900

function mapMedian(points: readonly (readonly number[])[], characterIndex: number): readonly StrokePoint[] {
  return points.map((point) => [
    characterIndex * cellSize + characterInset + point[0] * characterScale,
    characterInset + (hanziBaseline - point[1]) * characterScale,
  ] as const)
}

function makeRound(id: string, text: string, meaning: string): StrokeOrderGameRound {
  const characters = [...text]
  const strokes = characters.flatMap((character, characterIndex) =>
    characterData[character].medians.map((median) => mapMedian(median, characterIndex)))
  const strokeLabels = characters.flatMap((character) =>
    characterData[character].medians.map((_, index) => index + 1))
  return {
    id,
    targetId: id,
    targetText: text,
    meaning,
    audioText: text,
    strokes,
    strokeLabels,
  }
}

const familiarRounds = [
  makeRound('grade2-familiar-one', '一', 'one'),
  makeRound('grade2-familiar-two', '二', 'two'),
  makeRound('grade2-familiar-three', '三', 'three'),
] as const

const targetRounds = [
  ...secondGradeWritingTargets.map((target) =>
    makeRound(`grade2-target-${target.id}`, target.text, target.meaning)),
] as const

export const secondGradeRounds: readonly StrokeOrderGameRound[] = [
  ...familiarRounds,
  ...targetRounds,
]

const datasetId = 'grade2-week-0921-stroke-order-v1'

function acquisitionTarget(round: StrokeOrderGameRound, dataset: string): StrokeOrderAcquisitionTarget {
  return {
    id: `${dataset}:${round.targetId}`,
    text: round.targetText,
    sentence: '',
    datasetId: dataset,
    language: 'mandarin',
    tier: 'tier-1',
    activityType: 'dictation',
    strokeRoundId: round.id,
  }
}

const familiarDtTargets = familiarRounds.map((round) =>
  acquisitionTarget(round, '__stroke-familiar-dt__'))

const targets = targetRounds.map((round) => acquisitionTarget(round, datasetId))

export const secondGradeAcquisitionStrategy = {
  ...grade2AcquisitionStrategy,
  id: 'stroke-oder-slash-grade2-0921-v1',
  version: 1,
  familiarDtTargets,
  introductionSequence: strokeOrderIntroductionSequence,
  timers: {
    ...grade2AcquisitionStrategy.timers,
    ...secondGradeTargetTimerOverrides,
  },
} as const satisfies AcquisitionStrategy<StrokeOrderAcquisitionTarget>

export const secondGradeTargetSet = {
  id: datasetId,
  targets,
} as const satisfies AcquisitionTargetSet<StrokeOrderAcquisitionTarget>

export const secondGradeAcquisitionConfig = {
  targetSet: secondGradeTargetSet,
  strategy: secondGradeAcquisitionStrategy,
} as const satisfies StrokeOrderAcquisitionConfig

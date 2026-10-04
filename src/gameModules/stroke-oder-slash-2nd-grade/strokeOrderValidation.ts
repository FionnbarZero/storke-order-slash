export type ValidationPoint = readonly [number, number]
export type ValidationStroke = readonly ValidationPoint[]

export type StrokeOrderViolation = {
  readonly expectedIndex: number
  readonly matchedIndex: number
  readonly reason: 'out-of-order' | 'reversed' | 'extra'
}

type StrokeFeatures = {
  readonly start: ValidationPoint
  readonly end: ValidationPoint
  readonly center: ValidationPoint
  readonly length: number
  readonly direction: ValidationPoint
}

function distance(a: ValidationPoint, b: ValidationPoint) {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function features(stroke: ValidationStroke): StrokeFeatures {
  const start = stroke[0]
  const end = stroke[stroke.length - 1]
  const center = stroke.reduce<ValidationPoint>(
    (sum, point) => [sum[0] + point[0] / stroke.length, sum[1] + point[1] / stroke.length],
    [0, 0],
  )
  const length = stroke.slice(1).reduce(
    (total, point, index) => total + distance(stroke[index], point),
    0,
  )
  const directionLength = Math.max(1, distance(start, end))
  return {
    start,
    end,
    center,
    length,
    direction: [(end[0] - start[0]) / directionLength, (end[1] - start[1]) / directionLength],
  }
}

function matchScore(candidate: StrokeFeatures, expected: StrokeFeatures) {
  const directionDot = candidate.direction[0] * expected.direction[0]
    + candidate.direction[1] * expected.direction[1]
  const directionPenalty = (1 - directionDot) * 18
  const lengthPenalty = Math.min(2, Math.abs(candidate.length - expected.length) / Math.max(15, expected.length)) * 8
  return distance(candidate.start, expected.start) * .45
    + distance(candidate.end, expected.end) * .35
    + distance(candidate.center, expected.center) * .15
    + directionPenalty
    + lengthPenalty
}

function reversed(featuresToReverse: StrokeFeatures): StrokeFeatures {
  return {
    ...featuresToReverse,
    start: featuresToReverse.end,
    end: featuresToReverse.start,
    direction: [-featuresToReverse.direction[0], -featuresToReverse.direction[1]],
  }
}

/**
 * Returns only confident ordering violations. A poorly shaped stroke that does
 * not clearly match another reference stroke is left for learner review.
 */
export function detectStrokeOrderViolation(
  candidateStroke: ValidationStroke,
  expectedStrokes: readonly ValidationStroke[],
  completedStrokeCount: number,
): StrokeOrderViolation | null {
  if (candidateStroke.length < 2) return null
  if (completedStrokeCount >= expectedStrokes.length) return {
    expectedIndex: expectedStrokes.length,
    matchedIndex: completedStrokeCount,
    reason: 'extra',
  }

  const candidate = features(candidateStroke)
  const expectedFeatures = expectedStrokes.map(features)
  const expected = expectedFeatures[completedStrokeCount]
  const expectedStartDistance = distance(candidate.start, expected.start)

  // Children rarely reproduce the model's shape precisely. If they begin near
  // the correct origin, treat the stroke order as correct and leave shape
  // quality to the learner's review instead of producing a false interruption.
  if (expectedStartDistance <= 24) return null

  const expectedScore = matchScore(candidate, expected)
  const reversedExpectedScore = matchScore(candidate, reversed(expected))
  const reversedStartDistance = distance(candidate.start, expected.end)

  if (
    reversedStartDistance <= 15
    && reversedStartDistance + 10 < expectedStartDistance
    && reversedExpectedScore <= 30
    && reversedExpectedScore + 10 < expectedScore
  ) return {
    expectedIndex: completedStrokeCount,
    matchedIndex: completedStrokeCount,
    reason: 'reversed',
  }

  const scores = expectedFeatures.map((reference) => matchScore(candidate, reference))
  const startDistances = expectedFeatures.map((reference) => distance(candidate.start, reference.start))
  const bestIndex = startDistances.reduce(
    (best, startDistance, index) => startDistance < startDistances[best] ? index : best,
    0,
  )
  const bestScore = scores[bestIndex]
  const bestStartDistance = startDistances[bestIndex]

  if (
    bestIndex !== completedStrokeCount
    && bestStartDistance <= 15
    && bestStartDistance + 10 < expectedStartDistance
    && bestScore <= 44
  ) return {
    expectedIndex: completedStrokeCount,
    matchedIndex: bestIndex,
    reason: 'out-of-order',
  }
  return null
}

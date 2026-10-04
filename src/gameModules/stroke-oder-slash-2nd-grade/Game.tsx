import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react'
import { Brush, Eraser, EyeOff, Play, RotateCcw, Save, Undo2, Volume2 } from 'lucide-react'
import {
  revealAcquisition,
  startAcquisition,
  transitionAcquisition,
  type EngineAcquisitionFlow,
} from '../../acquisition/index.ts'
import type {
  LearningGameAttempt,
  LearningGameBaseProps,
  PlayLearningAudio,
  StrokeOrderAcquisitionConfig,
  StrokeOrderAcquisitionTarget,
  StrokeOrderGameRound,
  StrokePoint,
} from './runtime/contracts'
import { LearningGameComplete, LearningGameEmpty, LearningGameShell, SelfAssessmentButtons } from './runtime/GameShell'
import { AutoAssessmentFeedback, type AssessmentFeedback } from './runtime/AssessmentFeedback'
import { playGameSound } from './runtime/gameFeel'
import { summarizeLearningGame } from './runtime/model'

type StrokePhase = 'trace' | 'write' | 'compare'
type NarrationState = 'idle' | 'playing' | 'ready' | 'error'
type InkStroke = StrokePoint[]
type InkDrawing = InkStroke[]

const strokeAnimationStaggerSeconds = .55
const strokeAnimationDurationSeconds = .46

function modelAnimationDurationMs(strokeCount: number) {
  if (strokeCount <= 0) return 0
  return ((strokeCount - 1) * strokeAnimationStaggerSeconds + strokeAnimationDurationSeconds) * 1000
}

function validStrokeOrderRounds(rounds: readonly StrokeOrderGameRound[]) {
  return rounds.length > 0
    && new Set(rounds.map((round) => round.id)).size === rounds.length
    && rounds.every((round) => round.id
      && round.targetId
      && round.targetText
      && round.strokes.length > 0
      && round.strokes.every((stroke) => stroke.length >= 2))
}

function strokePath(points: readonly StrokePoint[]) {
  return points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ')
}

function serializeStroke(stroke: readonly StrokePoint[]) {
  return stroke.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(' ')
}

function PracticeGrid({ characterCount }: { readonly characterCount: number }) {
  return <g className="sos2-stroke-grid-lines" aria-hidden="true">
    {Array.from({ length: characterCount }, (_, index) => <g key={index} transform={`translate(${index * 100} 0)`}>
      <rect x="3" y="3" width="94" height="94" rx="2" />
      <path d="M50 3v94M3 50h94M3 3l94 94M97 3 3 97" />
    </g>)}
  </g>
}

function pointFromClient(clientX: number, clientY: number, bounds: DOMRect, viewBoxWidth: number): StrokePoint {
  const x = Math.max(0, Math.min(viewBoxWidth, ((clientX - bounds.left) / bounds.width) * viewBoxWidth))
  const y = Math.max(0, Math.min(100, ((clientY - bounds.top) / bounds.height) * 100))
  return [x, y]
}

function appendDistinctPoint(points: InkStroke, point: StrokePoint) {
  const previous = points[points.length - 1]
  if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) >= .18) points.push(point)
}

function simplifyStroke(points: readonly StrokePoint[]) {
  if (points.length <= 2) return [...points]
  const simplified: StrokePoint[] = [points[0]]
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1]
    const point = points[index]
    if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) >= .3) simplified.push(point)
  }
  const finalPoint = points[points.length - 1]
  if (simplified[simplified.length - 1] !== finalPoint) simplified.push(finalPoint)
  return simplified
}

function StrokePad({
  round,
  strokes,
  onStrokesChange,
  showGuide,
  animationKey,
  label,
}: {
  readonly round: StrokeOrderGameRound
  readonly strokes: InkDrawing
  readonly onStrokesChange?: Dispatch<SetStateAction<InkDrawing>>
  readonly showGuide: boolean
  readonly animationKey: number
  readonly label: string
}) {
  const activePointer = useRef<number | null>(null)
  const activePoints = useRef<InkStroke>([])
  const activePath = useRef<SVGPathElement | null>(null)
  const padBounds = useRef<DOMRect | null>(null)
  const paintFrame = useRef<number | null>(null)
  const interactive = Boolean(onStrokesChange)
  const characterCount = Math.max(1, [...round.targetText].length)
  const viewBoxWidth = characterCount * 100

  useEffect(() => () => {
    if (paintFrame.current !== null) window.cancelAnimationFrame(paintFrame.current)
  }, [])

  function paintActiveStroke() {
    paintFrame.current = null
    activePath.current?.setAttribute('d', strokePath(activePoints.current))
  }

  function scheduleActivePaint() {
    if (paintFrame.current === null) paintFrame.current = window.requestAnimationFrame(paintActiveStroke)
  }

  function beginStroke(event: ReactPointerEvent<SVGSVGElement>) {
    if (!onStrokesChange || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointer.current = event.pointerId
    padBounds.current = event.currentTarget.getBoundingClientRect()
    activePoints.current = [pointFromClient(event.clientX, event.clientY, padBounds.current, viewBoxWidth)]
    scheduleActivePaint()
  }

  function continueStroke(event: ReactPointerEvent<SVGSVGElement>) {
    if (!onStrokesChange || activePointer.current !== event.pointerId || !padBounds.current) return
    event.preventDefault()
    const coalesced = typeof event.nativeEvent.getCoalescedEvents === 'function'
      ? event.nativeEvent.getCoalescedEvents()
      : []
    const samples = coalesced.length > 0 ? coalesced : [event.nativeEvent]
    samples.forEach((sample) => appendDistinctPoint(
      activePoints.current,
      pointFromClient(sample.clientX, sample.clientY, padBounds.current!, viewBoxWidth),
    ))
    scheduleActivePaint()
  }

  function endStroke(event: ReactPointerEvent<SVGSVGElement>) {
    if (activePointer.current !== event.pointerId) return
    if (event.type === 'pointerup' && padBounds.current) {
      appendDistinctPoint(
        activePoints.current,
        pointFromClient(event.clientX, event.clientY, padBounds.current, viewBoxWidth),
      )
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (paintFrame.current !== null) {
      window.cancelAnimationFrame(paintFrame.current)
      paintFrame.current = null
    }
    const completedStroke = simplifyStroke(activePoints.current)
    if (completedStroke.length >= 2) onStrokesChange?.((current) => [...current, completedStroke])
    activePath.current?.removeAttribute('d')
    activePointer.current = null
    activePoints.current = []
    padBounds.current = null
  }

  return <div
    className={`sos2-stroke-pad${interactive ? ' is-interactive' : ' is-saved'}${showGuide ? ' has-guide' : ''}`}
    style={{ aspectRatio: `${characterCount} / 1` }}
  >
    <svg
      viewBox={`0 0 ${viewBoxWidth} 100`}
      role={interactive ? 'application' : 'img'}
      aria-label={label}
      tabIndex={interactive ? 0 : undefined}
      onPointerDown={beginStroke}
      onPointerMove={continueStroke}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
    >
      <PracticeGrid characterCount={characterCount} />
      {showGuide && <g className="sos2-stroke-guide" key={`${round.id}-${animationKey}`} aria-hidden="true">
        {round.strokes.map((stroke, index) => <path
          key={`${round.id}-guide-${index}`}
          d={strokePath(stroke)}
          pathLength={1}
          style={{
            animationDelay: `${index * strokeAnimationStaggerSeconds}s`,
            animationDuration: `${strokeAnimationDurationSeconds}s`,
          }}
        />)}
        {round.strokes.map((stroke, index) => <g className="sos2-stroke-marker" key={`${round.id}-marker-${index}`} style={{ animationDelay: `${index * strokeAnimationStaggerSeconds}s` }}>
          <circle cx={stroke[0][0]} cy={stroke[0][1]} r="4.3" />
          <text x={stroke[0][0]} y={stroke[0][1] + 1.7}>{round.strokeLabels?.[index] ?? index + 1}</text>
        </g>)}
        {round.strokes.map((stroke, index) => <circle className="sos2-stroke-brush" key={`${round.id}-brush-${index}`} r="2.7">
          <animateMotion
            path={strokePath(stroke)}
            begin={`${index * strokeAnimationStaggerSeconds}s`}
            dur={`${strokeAnimationDurationSeconds}s`}
            fill="freeze"
          />
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            keyTimes="0;.08;.82;1"
            begin={`${index * strokeAnimationStaggerSeconds}s`}
            dur={`${strokeAnimationDurationSeconds}s`}
            fill="freeze"
          />
        </circle>)}
      </g>}
      <g className="sos2-student-ink">
        {strokes.map((stroke, index) => <path key={`ink-${index}`} d={strokePath(stroke)} />)}
        {interactive && <path className="sos2-active-ink" ref={activePath} />}
      </g>
    </svg>
    <span className="sos2-stroke-pad-label">{label}</span>
  </div>
}

function ReferencePad({ round }: { readonly round: StrokeOrderGameRound }) {
  const characters = [...round.targetText]
  const viewBoxWidth = Math.max(1, characters.length) * 100
  return <div className="sos2-stroke-pad is-reference" style={{ aspectRatio: `${characters.length} / 1` }}>
    <svg viewBox={`0 0 ${viewBoxWidth} 100`} role="img" aria-label={`Correct writing: ${round.targetText}`}>
      <PracticeGrid characterCount={characters.length} />
      {characters.map((character, index) => <text key={`${character}-${index}`} className="sos2-reference-character" x={50 + index * 100} y="76" textAnchor="middle">{character}</text>)}
      {round.strokes.map((stroke, index) => <g className="sos2-reference-marker" key={`${round.id}-reference-${index}`}>
        <circle cx={stroke[0][0]} cy={stroke[0][1]} r="4.3" />
        <text x={stroke[0][0]} y={stroke[0][1] + 1.7}>{round.strokeLabels?.[index] ?? index + 1}</text>
      </g>)}
    </svg>
    <span className="sos2-stroke-pad-label">Correct writing · {round.meaning}</span>
  </div>
}

function DrawingTools({ drawing, setDrawing }: {
  readonly drawing: InkDrawing
  readonly setDrawing: Dispatch<SetStateAction<InkDrawing>>
}) {
  return <div className="sos2-stroke-tools">
    <button type="button" disabled={!drawing.length} onClick={() => setDrawing((current) => current.slice(0, -1))}><Undo2 size={17} /> Undo stroke</button>
    <button type="button" disabled={!drawing.length} onClick={() => setDrawing([])}><Eraser size={17} /> Clear pad</button>
  </div>
}

type AcquisitionRevealMethod = 'timer' | 'skip_timer' | 'manual_compare'

function PromptCountdown({ promptId, durationSeconds, active, onComplete }: {
  readonly promptId: string
  readonly durationSeconds: number
  readonly active: boolean
  readonly onComplete: () => void
}) {
  const [seconds, setSeconds] = useState(durationSeconds)
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])
  useEffect(() => {
    setSeconds(durationSeconds)
    if (!active) return
    let remaining = durationSeconds
    const timer = window.setInterval(() => {
      remaining -= 1
      setSeconds(Math.max(0, remaining))
      if (remaining <= 0) {
        window.clearInterval(timer)
        onCompleteRef.current()
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [active, durationSeconds, promptId])
  return <>{seconds}s</>
}

function promptLabel(kind: NonNullable<EngineAcquisitionFlow['prompt']>['kind']) {
  if (kind === 'familiar-dt') return 'Familiar DT'
  if (kind === 'earned-dt') return 'Earned DT'
  if (kind === 'show-copy') return 'Show & copy'
  return 'Acquisition target'
}

function phaseLabel(phase: EngineAcquisitionFlow['phase']) {
  if (phase === 'expanded-trials') return 'Expanded Trials'
  if (phase === 'correction') return 'Correction'
  return 'Introduction'
}

export function StrokeOderSlash2ndGrade({
  rounds,
  acquisition,
  playAudio,
  title = 'Stroke Oder Slash 2nd grade',
  eyebrow = '2nd Grade · Acquisition',
  onExit,
  onAttempt,
  onComplete,
}: LearningGameBaseProps & {
  readonly rounds: readonly StrokeOrderGameRound[]
  readonly acquisition: StrokeOrderAcquisitionConfig
  readonly playAudio?: PlayLearningAudio
}) {
  const [flow, setFlow] = useState<EngineAcquisitionFlow<StrokeOrderAcquisitionTarget>>(() =>
    startAcquisition(acquisition.targetSet, acquisition.strategy, Math.random))
  const [phase, setPhase] = useState<StrokePhase>(flow.prompt?.kind === 'show-copy' ? 'trace' : 'write')
  const [traceDrawing, setTraceDrawing] = useState<InkDrawing>([])
  const [memoryDrawing, setMemoryDrawing] = useState<InkDrawing>([])
  const [savedDrawing, setSavedDrawing] = useState<InkDrawing>([])
  const [animationKey, setAnimationKey] = useState(0)
  const [modelAnimating, setModelAnimating] = useState(flow.prompt?.kind === 'show-copy')
  const [narrationKey, setNarrationKey] = useState(0)
  const [narrationState, setNarrationState] = useState<NarrationState>('idle')
  const [attempts, setAttempts] = useState<readonly LearningGameAttempt[]>([])
  const [feedback, setFeedback] = useState<AssessmentFeedback | null>(null)
  const [pendingFlow, setPendingFlow] = useState<EngineAcquisitionFlow<StrokeOrderAcquisitionTarget> | null>(null)
  const [revealMethod, setRevealMethod] = useState<AcquisitionRevealMethod>('manual_compare')
  const narrationRequestRef = useRef(0)
  const prompt = flow.prompt
  const round = prompt ? rounds.find((candidate) => candidate.id === prompt.word.strokeRoundId) : undefined
  const valid = validStrokeOrderRounds(rounds)
    && acquisition.targetSet.targets.length > 0
    && [...acquisition.targetSet.targets, ...acquisition.strategy.familiarDtTargets]
      .every((target) => rounds.some((candidate) => candidate.id === target.strokeRoundId))
  const complete = valid && flow.complete && flow.teachingComplete
  const remainingTraceStrokes = round ? Math.max(0, round.strokes.length - traceDrawing.length) : 0
  const targetIds = new Set(acquisition.targetSet.targets.map((target) => target.id))
  const mastered = flow.earnedDtPool.filter((target) => targetIds.has(target.id)).length
  const targetCompleted = Boolean(prompt && pendingFlow?.earnedDtPool.some((target) => target.id === prompt.word.id)
    && !flow.earnedDtPool.some((target) => target.id === prompt.word.id))
  const correctFeedbackTitle = targetCompleted
    ? 'Target acquired!'
    : prompt?.kind === 'familiar-dt'
      ? 'Familiar DT complete.'
      : prompt?.kind === 'earned-dt'
        ? 'Earned DT retained.'
        : 'Correct — keep going.'
  const correctFeedbackDetail = targetCompleted
    ? 'This target is now available as an Earned DT.'
    : 'The engine selected the next Acquisition presentation.'

  const playCurrentNarration = useCallback(() => {
    if (!round || !playAudio) return
    const request = ++narrationRequestRef.current
    setNarrationState('playing')
    void Promise.resolve(playAudio(round.audioText || round.targetText)).then(
      () => {
        if (request === narrationRequestRef.current) setNarrationState('ready')
      },
      () => {
        if (request === narrationRequestRef.current) setNarrationState('error')
      },
    )
  }, [playAudio, prompt?.id, round])

  useEffect(() => {
    playCurrentNarration()
    return () => { narrationRequestRef.current += 1 }
  }, [narrationKey, playCurrentNarration])

  useEffect(() => {
    if (!prompt) return
    setPhase(prompt.kind === 'show-copy' ? 'trace' : 'write')
    setTraceDrawing([])
    setMemoryDrawing([])
    setSavedDrawing([])
    setModelAnimating(prompt.kind === 'show-copy')
    setAnimationKey((current) => current + 1)
    setRevealMethod('manual_compare')
  }, [prompt?.id])

  useEffect(() => {
    if (!prompt || prompt.kind !== 'show-copy' || phase !== 'trace' || !round || !modelAnimating) return
    const timer = window.setTimeout(
      () => setModelAnimating(false),
      modelAnimationDurationMs(round.strokes.length),
    )
    return () => window.clearTimeout(timer)
  }, [animationKey, modelAnimating, phase, prompt?.id, round])

  useEffect(() => {
    if (!feedback || !pendingFlow) return
    const timer = window.setTimeout(() => {
      setFlow(pendingFlow)
      setPendingFlow(null)
      setFeedback(null)
    }, feedback === 'correct' ? 1000 : 1900)
    return () => window.clearTimeout(timer)
  }, [feedback, pendingFlow])

  function reviewShowCopy(method: AcquisitionRevealMethod) {
    if (!prompt || prompt.kind !== 'show-copy' || feedback) return
    setSavedDrawing(traceDrawing.map((stroke) => [...stroke]))
    setRevealMethod(method)
    setFlow((current) => revealAcquisition(current))
    setPhase('compare')
    playGameSound('progress')
  }

  function assessShowCopy(correct: boolean) {
    if (!prompt || prompt.kind !== 'show-copy' || feedback || phase !== 'compare') return
    if (!correct) {
      playGameSound('incorrect')
      setFlow((current) => current.prompt ? {
        ...current,
        prompt: { ...current.prompt, revealed: false },
      } : current)
      setTraceDrawing([])
      setSavedDrawing([])
      setModelAnimating(true)
      setAnimationKey((current) => current + 1)
      setPhase('trace')
      return
    }
    const transition = transitionAcquisition(
      flow,
      acquisition.targetSet,
      acquisition.strategy,
      { correct: true, revealMethod },
      Math.random,
    )
    playGameSound('correct')
    setFlow(transition.nextFlow)
  }

  function revealHidden(method: AcquisitionRevealMethod) {
    if (!prompt || prompt.kind === 'show-copy' || phase !== 'write' || feedback) return
    setSavedDrawing(memoryDrawing.map((stroke) => [...stroke]))
    setRevealMethod(method)
    setFlow((current) => revealAcquisition(current))
    setPhase('compare')
    playGameSound('progress')
  }

  function replayModel() {
    setModelAnimating(true)
    setAnimationKey((current) => current + 1)
  }

  function assess(correct: boolean) {
    if (!round || !prompt || feedback || phase !== 'compare') return
    const attempt: LearningGameAttempt = {
      gameId: 'stroke-oder-slash-2nd-grade',
      promptId: prompt.id,
      targetId: prompt.word.id,
      correct,
      response: savedDrawing.map(serializeStroke),
      assessmentMode: 'self-assessment',
    }
    const transition = transitionAcquisition(
      flow,
      acquisition.targetSet,
      acquisition.strategy,
      { correct, revealMethod },
      Math.random,
    )
    setAttempts((current) => [...current, attempt])
    onAttempt?.(attempt)
    playGameSound(correct ? 'correct' : 'incorrect')
    setPendingFlow(transition.nextFlow)
    setFeedback(correct ? 'correct' : 'incorrect')
  }

  const summary = summarizeLearningGame('stroke-oder-slash-2nd-grade', attempts)
  return <LearningGameShell
    gameId="stroke-oder-slash-2nd-grade"
    title={title}
    eyebrow={eyebrow}
    progress={`${mastered}/${acquisition.targetSet.targets.length} mastered`}
    onExit={onExit}
  >
    {!valid ? <LearningGameEmpty onExit={onExit} /> : complete ? <LearningGameComplete
      summary={summary}
      message="The Acquisition teaching sequence is complete. This target is now an Earned DT."
      onDone={() => onComplete(summary)}
    /> : round && prompt ? <section className="sos2-card sos2-production-card sos2-stroke-order-card">
      <p className="sos2-round-label">{phaseLabel(flow.phase)} · {promptLabel(prompt.kind)} · {prompt.timerSeconds}s</p>
      <div className="sos2-phase-steps" aria-label={`Current presentation: ${promptLabel(prompt.kind)}`}>
        <span className={phase === 'trace' || phase === 'write' ? 'is-current' : 'is-complete'}><b>1</b>{prompt.kind === 'show-copy' ? 'Watch & copy' : 'Write from memory'}</span>
        <span className={phase === 'compare' && !feedback ? 'is-current' : feedback ? 'is-complete' : ''}><b>2</b>{prompt.kind === 'show-copy' ? 'Review' : 'Compare'}</span>
        <span className={feedback ? 'is-current' : ''}><b>3</b>{prompt.kind === 'show-copy' ? 'Next trial' : 'Self-assess'}</span>
      </div>
      {feedback ? <AutoAssessmentFeedback
        feedback={feedback}
        lastRound={Boolean(pendingFlow?.complete)}
        correctTitle={correctFeedbackTitle}
        correctDetail={correctFeedbackDetail}
      /> : prompt.kind === 'show-copy' && phase === 'trace' ? <>
        <div className="sos2-stroke-heading">
          <div><p className="sos2-kicker">Stroke-order demonstration · {traceDrawing.length}/{round.strokes.length} strokes copied</p><h2>Watch <span lang="zh-Hans">{round.targetText}</span> draw itself, then copy it</h2></div>
          <button className="sos2-audio" type="button" onClick={playCurrentNarration}><Volume2 size={18} /> {narrationState === 'playing'
            ? 'Playing…'
            : narrationState === 'error' ? `Tap to hear ${round.targetText}` : 'Hear it'}</button>
        </div>
        <StrokePad round={round} strokes={traceDrawing} onStrokesChange={setTraceDrawing} showGuide animationKey={animationKey} label={`Animated stroke order · ${traceDrawing.length}/${round.strokes.length} strokes copied`} />
        <div className="sos2-stroke-actions">
          <DrawingTools drawing={traceDrawing} setDrawing={setTraceDrawing} />
          <button className="sos2-stroke-replay" type="button" onClick={replayModel}><Play size={17} /> Replay stroke order</button>
          <button className="sos2-stroke-replay" type="button" onClick={() => reviewShowCopy('skip_timer')}>Review now</button>
          <button className="sos2-primary" type="button" disabled={traceDrawing.length < round.strokes.length} onClick={() => {
            reviewShowCopy('manual_compare')
          }}><Save size={18} /> {remainingTraceStrokes > 0
            ? `Lift your finger, then draw ${remainingTraceStrokes} more ${remainingTraceStrokes === 1 ? 'stroke' : 'strokes'}`
            : 'Review my copy'}</button>
        </div>
        <p className="sos2-round-label">{modelAnimating
          ? 'Model writing · timer starts after the final stroke'
          : <>Your writing time · <PromptCountdown key={`${prompt.id}:copy:${animationKey}`} promptId={prompt.id} durationSeconds={prompt.timerSeconds} active onComplete={() => reviewShowCopy('timer')} /></>}</p>
      </> : phase === 'write' ? <>
        <div className="sos2-stroke-heading">
          <div><p className="sos2-kicker">{promptLabel(prompt.kind)} · guide hidden</p><h2>Listen, then write the target from memory</h2></div>
          <span className="sos2-memory-seal"><Brush size={19} /> <PromptCountdown key={`${prompt.id}:write`} promptId={prompt.id} durationSeconds={prompt.timerSeconds} active onComplete={() => revealHidden('timer')} /></span>
        </div>
        <StrokePad round={round} strokes={memoryDrawing} onStrokesChange={setMemoryDrawing} showGuide={false} animationKey={animationKey} label={`Memory writing · ${memoryDrawing.length} strokes saved`} />
        <div className="sos2-stroke-actions">
          <DrawingTools drawing={memoryDrawing} setDrawing={setMemoryDrawing} />
          <button type="button" className="sos2-stroke-replay" onClick={() => setNarrationKey((current) => current + 1)}><RotateCcw size={17} /> Hear it again</button>
          <button type="button" className="sos2-stroke-replay" onClick={() => revealHidden('skip_timer')}>Skip timer</button>
          <button className="sos2-primary" type="button" disabled={!memoryDrawing.length} onClick={() => {
            revealHidden('manual_compare')
          }}><EyeOff size={18} /> Save and compare</button>
        </div>
      </> : <div className="sos2-stroke-review">
        <p className="sos2-kicker">Your response is saved</p>
        <h2>{prompt.kind === 'show-copy' ? 'Review your copy before continuing' : 'Compare your writing with the target'}</h2>
        <div className="sos2-stroke-comparison">
          <section><strong>Your writing</strong><StrokePad round={round} strokes={savedDrawing} showGuide={false} animationKey={animationKey} label={`${savedDrawing.length} saved strokes`} /></section>
          <span aria-hidden="true">→</span>
          <section className="is-target"><strong>Correct target</strong><ReferencePad round={round} /></section>
        </div>
        <button className="sos2-audio" type="button" onClick={playCurrentNarration}><Volume2 size={18} /> {narrationState === 'playing'
          ? 'Playing…'
          : narrationState === 'error' ? `Tap to hear ${round.targetText}` : `Hear ${round.targetText}`}</button>
        <p>Does your writing match the shapes and stroke order?</p>
        <p className="sos2-review-wait">This screen waits for the student’s answer.</p>
        <SelfAssessmentButtons
          incorrectLabel="Needs correction"
          correctLabel="I got it"
          onAnswer={prompt.kind === 'show-copy' ? assessShowCopy : assess}
        />
      </div>}
    </section> : null}
  </LearningGameShell>
}

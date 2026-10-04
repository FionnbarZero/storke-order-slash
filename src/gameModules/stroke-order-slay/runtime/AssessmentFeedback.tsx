export type AssessmentFeedback = 'correct' | 'incorrect'

export function AutoAssessmentFeedback({ feedback, lastRound }: {
  readonly feedback: AssessmentFeedback
  readonly lastRound: boolean
}) {
  return <div className={`lg-feedback is-${feedback} is-auto lg-assessment-feedback`} role="status">
    <div className="lg-feedback-energy" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <i key={index} />)}</div>
    <span className="lg-feedback-emblem" aria-hidden="true">{feedback === 'correct' ? '✓' : '↻'}</span>
    <strong>{feedback === 'correct' ? 'Target mastered!' : 'Learning moment — one more try.'}</strong>
    <span className="lg-feedback-detail">{feedback === 'correct' ? 'Mastery +1' : 'This target stays in practice until it feels solid.'}</span>
    <span className="lg-auto-status">{feedback === 'correct' ? lastRound ? 'Preparing your result…' : 'Next challenge coming up…' : 'Resetting for your retry…'}</span>
  </div>
}

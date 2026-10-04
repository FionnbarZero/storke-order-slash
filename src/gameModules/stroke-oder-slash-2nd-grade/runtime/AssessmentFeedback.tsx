export type AssessmentFeedback = 'correct' | 'incorrect'

export function AutoAssessmentFeedback({
  feedback,
  lastRound,
  correctTitle = 'Response recorded!',
  correctDetail = 'The next Acquisition presentation is ready.',
  incorrectTitle = 'Needs more practice.',
  incorrectDetail = 'The engine selected the next teaching presentation.',
}: {
  readonly feedback: AssessmentFeedback
  readonly lastRound: boolean
  readonly correctTitle?: string
  readonly correctDetail?: string
  readonly incorrectTitle?: string
  readonly incorrectDetail?: string
}) {
  return <div className={`sos2-feedback is-${feedback} is-auto sos2-assessment-feedback`} role="status">
    <div className="sos2-feedback-energy" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <i key={index} />)}</div>
    <span className="sos2-feedback-emblem" aria-hidden="true">{feedback === 'correct' ? '✓' : '↻'}</span>
    <strong>{feedback === 'correct' ? correctTitle : incorrectTitle}</strong>
    <span className="sos2-feedback-detail">{feedback === 'correct' ? correctDetail : incorrectDetail}</span>
    <span className="sos2-auto-status">{lastRound && feedback === 'correct' ? 'Preparing your result…' : 'Next presentation coming up…'}</span>
  </div>
}

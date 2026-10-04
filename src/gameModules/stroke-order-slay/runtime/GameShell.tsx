import { Check, Sparkles, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { LearningGameId, LearningGameSummary } from './contracts'
import '../styles.css'

export function LearningGameShell({ gameId, title, eyebrow, progress, onExit, children }: {
  readonly gameId?: LearningGameId
  readonly title: string
  readonly eyebrow: string
  readonly progress: string
  readonly onExit: () => void
  readonly children: ReactNode
}) {
  const progressValues = progress.match(/(\d+)\s*\/\s*(\d+)/)
  const current = Number(progressValues?.[1] || 0)
  const total = Number(progressValues?.[2] || 0)
  const percentage = total ? Math.min(100, Math.max(0, (current / total) * 100)) : 0

  return <main className={`lg-shell${gameId ? ` lg-world-${gameId}` : ''}`}>
    <div className="lg-world-atmosphere" aria-hidden="true"><i /><i /><i /></div>
    <div className="lg-topbar">
      <button className="lg-exit" type="button" onClick={onExit}><X size={18} /> Exit game</button>
      <div className="lg-progress" aria-label={`Mastery progress: ${progress}`}>
        <span><Sparkles size={13} aria-hidden="true" /> Mastery <strong>{progress}</strong></span>
        <i aria-hidden="true"><b style={{ width: `${percentage}%` }} /></i>
      </div>
    </div>
    <header className="lg-heading">
      <p>{eyebrow}</p>
      <h1>{title}</h1>
    </header>
    {children}
  </main>
}

export function LearningGameComplete({ summary, message, onDone }: {
  readonly summary: LearningGameSummary
  readonly message: string
  readonly onDone: () => void
}) {
  const accuracy = summary.attempted ? Math.round((summary.correct / summary.attempted) * 100) : 0
  const retries = summary.attempted - summary.correct
  const achievement = retries === 0 ? 'Flawless mastery' : retries <= 2 ? 'Strong mastery' : 'Practice powered'
  return <section className="lg-card lg-complete" aria-live="polite">
    <div className="lg-complete-burst" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</div>
    <span className="lg-complete-mark"><Check size={30} /></span>
    <p className="lg-kicker">{achievement}</p>
    <h2>{summary.correct} mastered</h2>
    <div className="lg-complete-stats">
      <span><strong>{accuracy}%</strong> attempt accuracy</span>
      <span>{retries ? <><strong>{retries}</strong> learning {retries === 1 ? 'retry' : 'retries'}</> : <><strong>★</strong> first try</>}</span>
    </div>
    <p>{message}</p>
    <button className="lg-primary" type="button" onClick={onDone}>Back to game lab</button>
  </section>
}

export function LearningGameEmpty({ onExit }: { readonly onExit: () => void }) {
  return <section className="lg-card lg-empty" role="status">
    <h2>This game has no prompts yet.</h2>
    <p>The learning engine must provide a validated prompt set before play begins.</p>
    <button className="lg-primary" type="button" onClick={onExit}>Return</button>
  </section>
}

export function SelfAssessmentButtons({ onAnswer, incorrectLabel = 'Try once more', correctLabel = 'I got it' }: {
  readonly onAnswer: (correct: boolean) => void
  readonly incorrectLabel?: string
  readonly correctLabel?: string
}) {
  return <div className="lg-self-assessment">
    <button className="lg-incorrect" type="button" onClick={() => onAnswer(false)}><X size={17} /> {incorrectLabel}</button>
    <button className="lg-correct" type="button" onClick={() => onAnswer(true)}><Check size={17} /> {correctLabel}</button>
  </div>
}

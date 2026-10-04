import { useEffect, useRef, useState } from 'react'
import { ArrowRight, RotateCcw } from 'lucide-react'
import StrokeOrderSlay, {
  type LearningGameSummary,
  type StrokeOrderGameRound,
} from './gameModules/stroke-order-slay'

const rounds: readonly StrokeOrderGameRound[] = [
  {
    id: 'stroke-one', targetId: 'one', targetText: '一', meaning: 'one', audioText: '一',
    strokes: [[[18, 52], [32, 51], [48, 49], [66, 47], [82, 49]]],
  },
  {
    id: 'stroke-two', targetId: 'two', targetText: '二', meaning: 'two', audioText: '二',
    strokes: [
      [[27, 35], [43, 34], [58, 32], [73, 33]],
      [[17, 68], [35, 67], [55, 64], [72, 63], [84, 66]],
    ],
  },
  {
    id: 'stroke-three', targetId: 'three', targetText: '三', meaning: 'three', audioText: '三',
    strokes: [
      [[30, 25], [45, 24], [58, 22], [70, 24]],
      [[28, 49], [43, 49], [58, 47], [70, 49]],
      [[17, 73], [34, 73], [53, 70], [70, 69], [83, 73]],
    ],
  },
  {
    id: 'stroke-person', targetId: 'person', targetText: '人', meaning: 'person', audioText: '人',
    strokes: [
      [[53, 20], [52, 34], [47, 49], [38, 65], [27, 78], [18, 84]],
      [[50, 43], [57, 54], [65, 65], [74, 75], [83, 81]],
    ],
  },
]

const recordings: Readonly<Record<string, string>> = {
  '一': `${import.meta.env.BASE_URL}audio/mandarin/one.wav`,
  '二': `${import.meta.env.BASE_URL}audio/mandarin/two.wav`,
  '三': `${import.meta.env.BASE_URL}audio/mandarin/three.wav`,
  '人': `${import.meta.env.BASE_URL}audio/mandarin/person.wav`,
}

export function App() {
  const activeAudio = useRef<HTMLAudioElement | null>(null)
  const settleActiveAudio = useRef<(() => void) | null>(null)
  const [session, setSession] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [summary, setSummary] = useState<LearningGameSummary | null>(null)

  function stopAudio() {
    const audio = activeAudio.current
    const settle = settleActiveAudio.current
    activeAudio.current = null
    settleActiveAudio.current = null
    settle?.()
    audio?.pause()
  }

  useEffect(() => () => stopAudio(), [])

  function playAudio(text: string, _language = 'zh-CN', playbackRate = 1) {
    stopAudio()
    const url = recordings[text]
    if (!url) return Promise.reject(new Error(`No recording for ${text}`))

    return new Promise<void>((resolve, reject) => {
      const audio = new Audio(url)
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        audio.onended = null
        audio.onerror = null
        if (activeAudio.current === audio) activeAudio.current = null
        if (settleActiveAudio.current === cancelPlayback) settleActiveAudio.current = null
        if (error) reject(error)
        else resolve()
      }
      const cancelPlayback = () => finish()
      activeAudio.current = audio
      settleActiveAudio.current = cancelPlayback
      audio.playbackRate = playbackRate
      audio.onended = () => finish()
      audio.onerror = () => finish(new Error(`Could not play ${text}`))
      void audio.play().catch((error: unknown) => finish(
        error instanceof Error ? error : new Error(`Could not play ${text}`),
      ))
    })
  }

  function returnHome() {
    stopAudio()
    setPlaying(false)
  }

  function startGame() {
    setSummary(null)
    setSession((current) => current + 1)
    setPlaying(true)
  }

  if (playing) {
    return <StrokeOrderSlay
      key={session}
      rounds={rounds}
      playAudio={playAudio}
      onExit={returnHome}
      onComplete={(result) => {
        setSummary(result)
        returnHome()
      }}
    />
  }

  return <main className="standalone-home">
    <section className="standalone-card">
      <p className="standalone-kicker">Touch-writing ninja training</p>
      <h1>Stroke-order Slay</h1>
      <p>Trace the animated guide, hide it, write the character from memory, and compare your work.</p>
      {summary && <div className="standalone-summary" role="status">
        <strong>{summary.correct}/{summary.attempted} mastered</strong>
        <span>Your latest training run is complete.</span>
      </div>}
      <button type="button" onClick={startGame}>
        {summary ? <><RotateCcw size={19} /> Train again</> : <>Begin training <ArrowRight size={19} /></>}
      </button>
    </section>
  </main>
}

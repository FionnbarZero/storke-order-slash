export type GameSound = 'select' | 'flip' | 'correct' | 'incorrect' | 'progress' | 'victory'

let audioContext: AudioContext | null = null

function tone(context: AudioContext, frequency: number, startsAt: number, duration: number, gainValue: number, type: OscillatorType = 'sine') {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, startsAt)
  gain.gain.setValueAtTime(0.0001, startsAt)
  gain.gain.exponentialRampToValueAtTime(gainValue, startsAt + .012)
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.onended = () => {
    oscillator.disconnect()
    gain.disconnect()
  }
  oscillator.start(startsAt)
  oscillator.stop(startsAt + duration + .02)
}

export function playGameSound(sound: GameSound) {
  if (typeof window === 'undefined') return
  const AudioContextClass = window.AudioContext
  if (!AudioContextClass) return

  try {
    audioContext ||= new AudioContextClass()
    const now = audioContext.currentTime
    if (audioContext.state === 'suspended') void audioContext.resume()

    if (sound === 'select') tone(audioContext, 330, now, .08, .035, 'triangle')
    if (sound === 'flip') {
      tone(audioContext, 220, now, .09, .035, 'triangle')
      tone(audioContext, 430, now + .045, .11, .025, 'sine')
    }
    if (sound === 'correct' || sound === 'progress') {
      tone(audioContext, 440, now, .12, .045, 'triangle')
      tone(audioContext, 660, now + .075, .16, .04, 'triangle')
      tone(audioContext, 880, now + .15, .19, .032, 'sine')
    }
    if (sound === 'incorrect') {
      tone(audioContext, 185, now, .14, .045, 'sawtooth')
      tone(audioContext, 145, now + .09, .2, .035, 'sawtooth')
    }
    if (sound === 'victory') {
      ;[523, 659, 784, 1047].forEach((frequency, index) => tone(audioContext!, frequency, now + index * .08, .28, .038, index === 3 ? 'sine' : 'triangle'))
    }
    if ('vibrate' in navigator) {
      if (sound === 'incorrect') navigator.vibrate?.([35, 45, 35])
      else if (sound === 'correct' || sound === 'progress') navigator.vibrate?.(25)
      else if (sound === 'victory') navigator.vibrate?.([25, 35, 25, 35, 50])
    }
  } catch {
    // Sound and vibration are enhancements; gameplay never depends on them.
  }
}

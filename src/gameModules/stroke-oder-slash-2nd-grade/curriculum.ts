export const secondGradeWritingTargets = [
  { id: 'biru', text: '比如', meaning: 'for example' },
  { id: 'bufen', text: '部分', meaning: 'part' },
  { id: 'geng', text: '更', meaning: 'more' },
  { id: 'fangbian', text: '方便', meaning: 'convenient' },
  { id: 'meihao', text: '美好', meaning: 'beautiful' },
] as const

export const secondGradeTargetSeconds = 20
export const secondGradeInitialCopySeconds = secondGradeTargetSeconds

export const secondGradeTargetTimerOverrides = {
  earnedDtSeconds: secondGradeTargetSeconds,
  introductionShowCopySeconds: secondGradeTargetSeconds,
  introductionHiddenTargetSeconds: secondGradeTargetSeconds,
  expandedStartSeconds: secondGradeTargetSeconds,
  expandedMinimumSeconds: secondGradeTargetSeconds,
  expandedDecrementSeconds: 0,
  correctionShowCopySeconds: secondGradeTargetSeconds,
  correctionHiddenSeconds: secondGradeTargetSeconds,
} as const

export { StrokeOderSlash2ndGrade, StrokeOderSlash2ndGrade as default } from './Game'
export { gameManifest } from './manifest'
export { secondGradeInitialCopySeconds, secondGradeWritingTargets } from './curriculum'
export {
  secondGradeAcquisitionConfig,
  secondGradeAcquisitionStrategy,
  secondGradeRounds,
  secondGradeTargetSet,
} from './demoConfig'
export { detectStrokeOrderViolation, type StrokeOrderViolation } from './strokeOrderValidation'
export type {
  LearningGameAttempt,
  LearningGameBaseProps,
  LearningGameSummary,
  PlayLearningAudio,
  StrokeOrderAcquisitionConfig,
  StrokeOrderAcquisitionTarget,
  StrokeOrderGameRound,
} from './runtime/contracts'

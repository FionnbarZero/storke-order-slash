# Acquisition engine

This directory contains the pure Acquisition state-machine boundary copied from the current `WeeklyDictationApp` working tree on `feature/grade2-safe-restore`.

The copied engine is independent of React, browser storage, Firebase, scoring aggregation, and application session orchestration. Consumers supply a target set, a strategy, reviewed responses, and randomness.

`strategies/grade2.ts` preserves the current Grade 2 v4 teaching sequence as extraction evidence. Its Familiar DT targets contain learning metadata only; Stroke-order Slay must adapt them to a versioned stroke/audio asset catalog before using that strategy in the game UI.

The engine has been copied without integration changes. Build a controller around the public exports in `index.ts`; do not make the game component responsible for Acquisition transitions.

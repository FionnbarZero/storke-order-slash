# Stroke Oder Slash 2nd grade

This is a complete, independent copy of the Stroke Order game for the second-grade Acquisition experience. Import `StrokeOderSlash2ndGrade` from its `index.ts`. Pass stroke-order `rounds`, `acquisition`, `onExit`, and `onComplete`; `playAudio` is optional. Touch, pointer, and mouse drawing are supported.

The module owns its component, runtime helpers, manifest, types, and styles. Its game ID and CSS namespace are distinct from the original module, so both can be installed in the same host and changed independently.

The bundled Grade 2 test configuration uses the writing targets `比如`, `部分`,
`更`, `方便`, and `美好`. Multi-character targets render one practice cell per
character and remain a single target in the Acquisition engine. Stroke-order
medians come from the `hanzi-writer-data` package.

Dependencies: `react`, `react-dom`, `lucide-react`, `hanzi-writer-data`.

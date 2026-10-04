# Storke Order Slash

A standalone home for the **Stroke-order Slay** touch-writing game from
EduGames. Children trace an animated Mandarin stroke-order guide, hide it,
rewrite the character from memory, save their response, and compare it with the
real character.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

## Verify

```sh
npm test
```

The production build is written to `dist/`.

## Reusable module

The complete copy-and-drop module lives at
`src/gameModules/stroke-order-slay/`. It owns its component, types, styles, and
runtime helpers. The small host in `src/App.tsx` supplies four sample characters
and their recorded Mandarin pronunciation.

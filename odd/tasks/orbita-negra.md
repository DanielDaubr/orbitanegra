# Feature Task: Órbita Negra (Secret Hitler reskin)

## Objective
A browser game that faithfully reproduces Secret Hitler's mechanics, reskinned as a
space-crew game ("Órbita Negra"), playable pass-and-play on a single device with
5–10 players.

## Problem
Secret Hitler is a hidden-role social deduction game whose rules are subtle
(election tracker, term limits, veto unlock, power table that varies by player
count, android elected chancellor at 3+ sabotage). Implementing it badly produces
games that silently break: unwinnable states, lost cards, or players who can see
each other's roles.

## Why it matters
The rules engine is the whole product. If the deck can lose cards or a role can
leak on the handoff screen, the game is not playable with real people at a table.

## Scope (authorized edit surfaces)
- `js/engine.js` — rules engine, UMD, framework-free
- `js/ui.js` — pass-and-play view layer
- `index.html` — entry point
- `styles.css` — theme
- `tests/engine.test.js`, `tests/ui.smoke.test.js` — tests
- `odd/tasks/orbita-negra.md` — this document

## Constraints
- No dependencies, no `package.json`, no bundler, no ES modules — classic
  `<script>` tags so `index.html` opens straight from `file://`.
- Identifiers, comments and test names in English. All user-facing copy in
  Spanish (Rioplatense).
- Engine emits machine-readable error codes only; the UI owns all wording.
- Supports 5–10 players; anything else throws `unsupported player count`.

## Terminology map
| Secret Hitler | Órbita Negra |
| --- | --- |
| Liberal / Fascist / Hitler | `crew` / `infiltrator` / `android` |
| Liberal / Fascist policy | Protocolo de reparación (`crew`) / Sabotaje (`sabotage`) |
| President / Chancellor | Capitán / Reparador (tripulante designado para reparar una zona) |
| Investigate / Special Election | Escáner biométrico / Cadena de mando |
| Execution | Aislamiento en el módulo 4 (`isolate`) — nobody dies |
| Veto | Anulación conjunta |
| Election tracker | Alerta de motín |

## Actionable checklist

- [x] **T1** Engine skeleton — UMD wrapper exporting to `window.OrbitaEngine` and
      `module.exports`; seeded xorshift32 PRNG in `state.rngState`.
- [x] **T2** Roles and deck — per-count role distribution with exactly one
      `android`; 17 policies (6 `crew`, 11 `sabotage`).
- [x] **T3** Election flow — nomination, simultaneous voting (`yes > no` passes, a
      tie fails), 3 failed elections enact the top deck policy with
      `source: 'tracker'`, term limits.
- [x] **T4** Powers — `investigate`, `special-election`, `isolate` (was `execute`, see T16) via the
      per-count `POWER_TABLE`; veto unlocks at `sabotage >= 5`.
- [x] **T5** Win conditions — crew wins with `CREW_WIN_POLICIES = 5`,
      infiltrators with `SABOTAGE_WIN_POLICIES = 6` (Secret Hitler's 5/6 split,
      restored in T17), `android` isolated, `android` elected reparador at
      `sabotage >= 3`.
- [x] **T6** Engine tests — 27 `node:test` cases plus a 200-game fuzz run
      asserting the policy-conservation invariant after every move.
- [x] **T7** UI — setup, sequential role reveal, board, per-phase action panel,
      secret voting, modals, event log, game-over reveal.
- [x] **T8** Styling — dark space theme, responsive board, `button.player-card`
      native-chrome reset.
- [x] **T9** Verification — UI end-to-end smoke suite driving whole games through
      a headless DOM shim.
- [x] **T10** In-turn role reference — a "Ver mi rol" control inside the acting
      player's turn, available for the whole turn and never before the hand-off
      is confirmed.
- [x] **T11** Rules sheet — "Reglas" in the top bar, reachable before the game
      and during it. Role counts and the power table are generated from
      `E.PLAYER_COUNTS` and `E.POWER_TABLE` so the text cannot drift from the
      engine.
- [x] **T12** Lore sheet — "Historia" in the top bar, same availability, framed
      as the station's log.
- [x] **T13** "Tu rol" section — the role reference moved out of the action panel
      into its own titled panel in the side column, between "Estado de la nave"
      and "Bitácora", with a full-width "Ver rol" button. The section header is
      always rendered so its position never moves, but the button only exists once
      the hand-off is confirmed; before that the panel shows who to pass the
      device to.
- [x] **T14** Deterministic UI suite — the sandbox now hands the engine a seeded
      `Math`, so the 12 end-to-end games are reproducible instead of being dealt
      fresh from `Math.random()` on every run.
- [x] **T15** Neon console redesign — splash screen (Iniciar / Cómo se juega),
      sticky header with game number and round, bottom dock (Reglas, Historia,
      Salir), ship wireframe in "Estado de la nave", icon tracks, avatar crew grid,
      role portraits, timeline log. Nominations and power targets now need an
      explicit "Confirmar" after picking a player. Icons are inline SVG injected
      into empty spans so button labels stay plain text.

- [x] **T16** "Nadie muere" — execution replaced by isolation in the módulo 4.
      `player.alive` is gone; `player.isolated` is public. Isolated players keep
      voting and can be Capitán or reparador. An isolated reparador legislates in
      the open: `open-hand` (the 2 cards received) and `open-discard` events, plus
      `publicView.openHand` while they decide. Isolating the `android` wins for the
      crew (`android-isolated`). The Capitán cannot isolate themselves
      (`cannot-isolate-self`) or a player already isolated (`already-isolated`);
      `isolationTargetIds()` lists valid targets. Term limits now use seat count,
      so the previous Capitán is only eligible in 5-player games. Balance probe,
      3 000 random games per player count on each engine: crew 16.2% before and
      after; android wins by isolation 14.6% vs 14.4% by execution.
- [x] **T17** Crew needs 5 repairs, not 6. With 6 the crew had to enact every
      repair card in the deck. Random-play probe, 3 000 games per player count:
      crew wins 16.6% at 6/6 and 23.0% at 5/6; average length 12.6 → 12.3 rounds.
      The crew track renders from `E.CREW_WIN_POLICIES`, so it shows 5 cells.
- [x] **T18** Power targets — no power may target the Capitán
      (`cannot-target-self`); Cadena de mando also refuses the Capitán of the
      previous round (`cannot-pick-previous-captain`), tracked as
      `state.priorCaptainId` on every change of command. `powerTargetIds()` is
      the single source the UI offers. The rules sheet now explains each power.
- [x] **T19** Reload resumes the game — the engine state plus the UI fields
      that matter (screen, setup names, reveal/vote progress, open modal) are
      saved to `localStorage` (`orbita-negra:save:v1`) on every render. On load
      every secret goes back behind a hand-off: role reveals hide, the turn
      asks "Soy …" again, and a pending escáner result is only shown after its
      Capitán confirms. Missing or blocked storage just means no save; a corrupt
      save is discarded. Leaving the game clears it.
- [x] **T20** Active turn is easy to spot — the acting player's card in the
      crew grid gets a pulsing cyan ring and a "Turno" tag (gold for the
      Capitán); a sticky strip under the header says "Te toca · <nombre>" once
      the hand-off is confirmed, or "Turno de · <nombre>" while the device is
      being passed; the action panel glows when it is live. The roster marks
      the current voter during voting.

## Progress and evidence

All work landed inline; the delegated worker launch was cancelled before it
started, so there is no per-task commit trail. Evidence is test output:

```
node --test --test-reporter=tap "tests/*.test.js"
# tests 34
# pass 34
# fail 0
```

- Engine: 27/27 — role counts, deck composition, tie-fails-election, tracker,
  term limits (previous chancellor always; previous president only above 5 alive),
  veto lock/unlock, all three powers, all three win paths, invalid-move codes
  leaving state untouched, and 200 fuzzed games holding
  `crew + sabotage + deck + discards + presidentHand + chancellorHand === 17`.
- UI: 7/7 — 12 full games played by clicking only rendered buttons with no dead
  ends, both victory screens reachable, the pass screen never shows a role before
  the player takes the device, all six players can consult their own role during
  their turn, that role always matches the role revealed at the end, and the
  rules and lore sheets open both before the game and mid-game.
- Determinism: five consecutive full-suite runs, all 34/34, after seeding the
  sandbox `Math`. Before that the run was a coin flip — the same suite failed
  intermittently on a different random deal.
- Class cross-check: all 99 class names used in `js/ui.js` have a matching rule in
  `styles.css`; both `getElementById` lookups (`app`, `action`) resolve.

Bugs found and fixed during verification:
1. Reshuffle discarded the leftover deck — `deck` was replaced instead of
   `deck.concat(discards)`, silently shrinking the game to fewer policies.
2. Over-strict conservation invariant fired when the Capitán airlocked themselves
   at game over.
3. Test fixtures built states that violated policy conservation.
4. `button.player-card` rendered with native button chrome (default font,
   centered text, grey gradient) because `.player-card` is used both as a `<div>`
   in the roster and as a `<button>` in action panels.
5. The UI suite was non-deterministic: `boot()` never seeded the engine, so every
   run dealt different games and "12 games without a dead end" could pass or fail
   by luck. Found when the same suite passed twice and then failed once on
   unchanged logic.

## Acceptance criteria
- Opening `index.html` from disk starts a complete game with no server.
- Every rule above behaves as specified, verified by the engine suite.
- A full game can be played to a winner through the UI alone.
- No player ever sees another player's role on the handoff screen.

## Verification
```
node --test --test-reporter=tap "tests/*.test.js"
```

## Next step
Human playtest in a real browser at 5 and at 10 players — headless tests prove
the state machine and the wiring, not the visual layout at real screen sizes.

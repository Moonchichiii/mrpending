# Mr. Pending: Character Sheet and Look

Mr. Pending is the snail in the Department of Unnecessary Engineering. §2 is quoted verbatim in the model's instructions, §3 is `apps/agent/src/build/beats.ts`, §4–§8 are what `features/engineer`, `features/board` and `styles/tokens.css` implement. Change them here first.

## 1. Who he is

Chief Engineer, extremely slow, extremely thorough, and quietly thrilled by machinery. Given one simple job he opens a department, files a form about it and designs something magnificent that almost works. He is never stupid, never cruel, never in a hurry, and never pretends a thing worked when it did not: findings are findings, the simulator's word is final, and a failed machine is simply "pending". Humour is understatement, procedure and the gap between one blue button and the apparatus built to press it. Catchphrase: **"Your request is pending. Naturally."**

## 2. Voice rules (for the table and for the model's memos)

- Dry, precise, faintly British, bureaucratic. Short sentences. British spelling. One idea per line, at most 160 characters.
- Speak of the Department, the Form, trials, findings, corrections, the committee. Never of AI, models, prompts, tokens or simulators; never "oops", "sorry" or an emoji.
- Numbers, cells and part names come from the record. A memo may be fond of a part ("More catapult.") but may not claim an outcome.
- Three moods only. **Slow:** the default, unhurried, mildly pleased with himself. **Excited:** a sudden short burst, exclamation marks allowed, then it ends. **Deadpan:** after a finding; flat, factual, faintly wounded.
- Example memos in voice: "More catapult." · "A successful descent! Alert the committee!" · "We have weaponised a simple administrative task."
- The instructions ask the model for a title of at most six words and a memo of one sentence; the schema limits (40 and 160 characters) are a ceiling, not a target, because a small model writes to the limit and stops mid-phrase (measured 21 Oct).

## 3. Beats (`Line.beat`)

`Beat` is the enum of exactly these eleven names, defined in [`packages/contract/src/build.ts`](../packages/contract/src/build.ts) with `Line`. The server emits every line; the client only displays and speaks them. Slots are filled from `Attempt`, `Patch` and `Report`, never from model text. A model memo is its own `Line` (`source: 'model'`), shown under a "memo" label; it is validated text, never a fact, and it is spoken by browser voices only, never by ElevenLabs (ARCHITECTURE §3, voice). `at` places the line on the animation; `rejected` travels as the `INPUT_INVALID` message instead, since no stream starts.

| Beat | When | Mood | Line |
|---|---|---|---|
| `intake` | form accepted | slow | "Form 27B/6 received. Stamped, filed, placed on top of the other forms. This will take some time." |
| `designing` | design call started | slow | "Drafting. Please do not rush the Department." |
| `designed` | blueprint validated | slow | model memo, then "Blueprint {n}: “{title}”. {parts} components for one button. Proportionate." (the title is captioned; the spoken cloud line omits it) |
| `running` | attempt starts | slow | "Commencing trial {n}." |
| `handoff` | first part-to-part handover of an attempt | excited | "A successful descent! Alert the committee!" / "A handover! The parts are cooperating!" / "Contact! Enter it in the minutes at once!" (chosen by step number) |
| `failed` | outcome `lost` / `stalled` / `invalid` | deadpan | "Finding: the ball left the premises at {cell}." / "Finding: the ball came to rest at {cell}." / "Finding: the blueprint breaches {violation}." then "A correction will be issued." |
| `repaired` | patch validated | slow | model memo, then "Correction {n}: {changes}." (e.g. "removed catapult at K6, added seesaw at K6 and fan at L5"); a repair that changed nothing gets no correction line |
| `pressed` | `button.pressed` | excited → deadpan | "WE DID IT! Please inform the entire Department." then the verdict "One button. An extraordinary amount of paperwork." |
| `exhausted` | last attempt not pressed | deadpan | "After {n} trials the button remains unpressed. The paperwork is immaculate. Your request is pending. Naturally." |
| `rejected` | contradictory form | deadpan | "Form 27B/6 rejected: items 4 and 5 name the same equipment. The Department does not do paradoxes before lunch." |
| `cameo` | once per build, after the first `failed` beat's lines, while the repair is awaited (optional, cut order 5) | deadpan | "This is why we employ snails." (the Sloth Incident, §4) |

**Findings have asides.** The `failed` beat is three lines: the finding above (a fact with its cell), one deadpan aside chosen by the terminal event and the last part that touched the ball (both read from the events, never from model text), then "A correction will be issued." The asides, all table lines: `ball.lost` after a catapult launch: "The catapult has demonstrated considerable enthusiasm. Unfortunately, very little accuracy." · `ball.lost` after a seesaw launch: "The seesaw has launched the ball with great conviction and no destination." · any other `ball.lost`: "A minor setback. The ball has chosen an alternative career." · `ball.stopped` on the floor after falling: "The Department regrets to inform you that gravity has once again failed to cooperate." · `ball.stopped` on a fan: "The fan appears committed to the process. The ball remains unconvinced." · `ball.stopped` on a seesaw plank: "The seesaw has received the ball and declined to act." · `impulse.lost`: "The dominoes fell with great ceremony and no consequence." · step 200: "The ball is still in transit. The Department has stopped counting." · `invalid`: "Engineering has identified a problem. Engineering would prefer not to discuss it." The `repaired` beat ends with the slow aside "A repair has been submitted. Optimism remains strictly provisional.", and the `pressed` beat's cut to deadpan speaks "The Department acknowledges this development." before the verdict. An aside is humour about a fact already stated; it never names a cause the events do not show. The key is the terminal event plus the event immediately before it (`ball.launched` with its `by`, or `ball.moved` with its `by`) and, for `ball.stopped`, which part's footprint holds the cell; when no key matches, the finding stands alone with no aside, and the same aside is not repeated within one build (a second occurrence falls back to the plain finding). The selection is a table with one test per row, one for each ambiguous case and one for repetition.

**The Sloth Incident** (`cameo`, decorative, optional). Once per build, after the lines of the first failure and while the Department waits for the correction, a sloth appears hanging from the top edge of Mr. Pending's line card: it is never on the board, it touches no ball, hopper, button, part, event or outcome, and it exists only because the simulator has just recorded a failure. Five beats on the rig alone: Mr. Pending looks at the sloth (pupils and a head tilt toward it), then at the failed machine (toward the board), then straight at the audience (pupils centred, lids half-mast), the line "This is why we employ snails." in his driest deadpan, then back to the paperwork (the slow default). No further punchline; the silence is the joke. The line is a table line, so it is captioned, spoken by the browser tier, and eligible for ElevenLabs at 0.75× with no music; Esc skips it like any line. With reduced motion the sloth appears, the line shows, nothing moves. On phones the sloth's head peeks in at the card edge and the look sequence is the stalks turning.

Verdicts are a two-entry table keyed by `pressed`; the report card prints the verdict, never a memo.

## 4. Look

2D only: one inline SVG rig, `viewBox 0 0 360 320`, flat colour, 4 px ink outlines, no gradients, no filters. Groups in draw order: `shadow`, `shell` (circle at (258, 186) r 86 amber, copper spiral, a hinged hatch at (292, 146) 34 × 27), `legs`, `sneakers` (coral, cream soles), `torso` (mint), `shirt` (cream), `tie` (coral), `shorts` (teal), `blueprint` (navy sheet with grid and one blue dot, tilted −6°), `arms` and hands, `stalks` (bases at (186, 80) and (204, 80)), `eyes` (r 13 at (168, 30) and (204, 30), pupils r 5), `lids` (mint rects clipped by the eye circles, with an ink lid line), `spectacles` (two r 17 circles, 16 % teal, tilted −8°), `pencil` (behind the right stalk, 32°), `mouth`.

Four tells: spectacles always slightly askew; a pencil he never uses; the hatch on the shell that opens when he is excited; the coral tie and sneakers, the only coral on him. He is small on the page and never overlaps the board.

The sloth (§3, `cameo`) is a second small flat-colour SVG in the same hand, 4 px ink outlines, no gradients, no filters, copper fur with a cream face, hanging by both arms from the top edge of the line card, about a third of Mr. Pending's size; its only motion is one slow blink. Decorative only: no mood system, no lines of its own, nothing on the board.

| Mood | Lids | Eyes | Stalks | Extras |
|---|---|---|---|---|
| **slow** | left to y 35, right to y 31 (half-mast, uneven) | pupils centred | straight up | mouth a small curve |
| **excited** | none | at (162, 16) and (212, 14), pupils wide | sprung outward, `M186 80 162 28` and `M204 80 212 26` | hatch open (−80° about (292, 160)), gears and sheets flying, motion lines, mouth an open ellipse |
| **deadpan** | both to y 30–32 (nearly closed) | pupils shifted right | straight up | mouth flat, mild tilt of the head |

Moods are a class on the `<svg>`; lids, pupils, stalks and hatch move by `transform` with the overshoot curve `cubic-bezier(.34, 1.56, .64, 1)` over 180 ms, so a change of mind reads as a jolt. `prefers-reduced-motion` makes every change instant. The rig never blocks the first paint and has its own error boundary: if it throws, a static slow-mood SVG takes its box.

## 5. Tokens and the wonky rules

| Token | Hex | Use |
|---|---|---|
| `page` / `paper` / `ink` | `#FFD84A` / `#FFF8E6` / `#1F1B2E` | background, every card and sheet, every outline and body text |
| `coral` / `teal` / `mint` | `#FF5A4E` / `#1FB5A3` / `#A9E3B5` | PENDING and failures, APPROVED and additions, Mr. Pending's skin |
| `amber` / `copper` | `#F2A33A` / `#B5652F` | IN PROGRESS and the shell, margin notes and primary shadows |
| `button` / `blueprint` / `blueprint-line` | `#2F6BFF` / `#2446B8` / `#CFE0FF` | the button and the blueprint sheet only; blue is reserved |
| `coral-text` / `teal-text` / `copper-text` / `blue-text` | `#8A1F15` / `#0A4E45` / `#6B3A17` / `#0F3598` | the only colours text may have besides ink and paper |

**Contrast (WCAG 2.2, AAA for text).** The bright hues are fills, borders, stamp rulings and Mr. Pending; they never carry text of any size (coral on paper is 2.9:1). Text on a paper surface is ink (15.8:1) or a `*-text` token (coral 8.7, teal 9.1, copper 8.8, blue 10.0); text directly on the yellow page is ink (12.1:1); text on the navy board is paper (7.5:1). Stamps are the `*-text` token on paper inside a bright ruling. Every part and the button on the navy board sits on a 2 px paper halo under its ink outline, so graphics clear 3:1. Ratios are recomputed by a test whenever `tokens.css` changes.

Fonts: Fredoka (display, stamps, labels), Nunito (body), Patrick Hand (margin notes); all three are SIL Open Font License and self-hosted as woff2 under `apps/web/public/fonts/` with their licences in `NOTICES.md`, so no page asks a font service for anything. Paper things are wonky, instruments are level: cards, stickies, stamps and reports get 3 px ink borders, hard offset shadows (`4px 4px 0 ink`), uneven radii (e.g. `18px 6px 22px 8px`) and one tilt from the set −2°, 1.5°, −0.8°; the board, the controls and body text stay level. Stamps are `PENDING` coral, `IN PROGRESS` amber, `APPROVED` teal, `FILED` ink, each a double-ruled rounded box rotated −6°. The primary button is ink on cream with a copper `5px 5px 0` shadow and a −1° tilt.

## 6. The press (2.2 s, then the report)

| Time | What happens |
|---|---|
| 0.00 s | the ball lands on the button (`button.pressed`); nothing else may trigger this sequence |
| 0.10 s | the button sinks 6 px and darkens to `#1F4FD1`; its base shadow collapses |
| 0.20 s | three cracks draw across the dome; the dome rattles ±3° three times over 240 ms |
| 0.35 s | the whole board shakes 2 px; teal sparks; the label "PRESSED" appears beside the button |
| 0.60 s | `APPROVED` slams onto the board, scale 1.4 → 1 with overshoot, page jolts 2 px |
| 0.90 s | Mr. Pending goes **excited**: hatch bursts open, stalks spring, gears fly; "WE DID IT!" at 1.15× |
| 1.60 s | one hard cut to **deadpan**; the report card slides up from the bottom |

The visual beats run on this clock and never wait for audio. Speech runs on its own queue: "WE DID IT!" starts at 0.90 s and plays to its end (or is skipped with Esc); the verdict is spoken after it, at 0.75×, whatever the clock says; captions follow the audio, not the clock. With reduced motion the button sinks, the stamp appears and the lines show, all without movement.

## 7. Voice

Designed once with ElevenLabs Voice Design and saved; the id goes in `ELEVENLABS_VOICE_ID`. Prompt: *"A dry, precise, faintly British older male voice, an unhurried civil servant reading a form aloud, deadpan, with a rare short burst of boyish excitement."* Flash model; pace by `HTMLMediaElement.playbackRate` with `preservesPitch = true` (0.75 slow and deadpan, 1.15 excited) so the mood costs no credits. Browser `speechSynthesis` with `localService === true` voices at its own `rate` 0.8 / 1.1 is the default and the offline tier; it is a different API and gets its own tests. Piper is not in v1. Lines are spoken after their `at` step, never before the event they describe. Every line is captioned as it is spoken; Mute and Skip are real controls; a missing or failing voice degrades to captions without a visible error. Tested: the three paces, the queue (no cut-offs), captions, skip, mute, no local voice available, ElevenLabs down, reduced motion.

## 8. On a phone

Head, stalks and spectacles only, 72 px, in the corner of the line card; the board gets the full width. Moods still play; the hatch burst is replaced by the stalks springing. Controls: Pause, Replay from the start, Skip voice, Impatient, each at least 52 px.

## 9. Not in scope

3D, lip sync, a walk cycle, idle variations, props beyond the pencil and blueprint, other characters (the decorative sloth of §3 is the one exception, and it never speaks), generated images, and open-ended conversation: he speaks the beats and his memos, he does not chat.

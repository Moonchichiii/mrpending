# Mr. Pending

Mr. Pending is a very slow snail, Chief Engineer of the Department of Unnecessary Engineering, with one job: press one blue button. A local open-weight model (Gemma 4 through Ollama) designs an absurd machine for it, a deterministic simulator runs the machine and reports exactly where it stopped, the model repairs its own design, and Mr. Pending narrates the whole affair before issuing an Engineering Report. The public site replays machines recorded from local inference; live generation runs only on your own machine.

Status: pre-alpha. Specifications: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/MACHINE-RULES.md`](docs/MACHINE-RULES.md), [`docs/SECURITY-AND-FAILURE-CONTRACT.md`](docs/SECURITY-AND-FAILURE-CONTRACT.md), [`docs/MR-PENDING-CHARACTER-SHEET.md`](docs/MR-PENDING-CHARACTER-SHEET.md).

## How the gallery was produced

Every gallery record is a build recorded on the local installation (`INFERENCE_MODE=local`, Gemma 4 through Ollama) during an eval run, then written into `apps/web/public/gallery/` with `bun eval/src/run.ts --gallery eval/results/<date>-eval.json`. The public site replays those records with zero inference; it checks each record's `rulesVersion`, re-simulates every attempt and recomputes the report before showing it, and it refuses a record whose `model.host` is not `ollama`. The provenance a record carries (`model.digest`, `model.runtime`) documents the recording; it does not prove it.

## Accessibility

The target is WCAG 2.2 AA in full plus every applicable AAA criterion. No AAA conformance is claimed for the app as a whole. This section states exactly what has been tested and what has not.

**Automated, in the Playwright suite** (`bun run --cwd apps/web e2e`, Chromium only; CI does not run it):

- axe (WCAG 2.0, 2.1 and 2.2 A and AA tags plus `wcag2aaa`) reports zero violations on these states:
  - static front door, with the gallery and longest-legal gallery records
  - Form 27B/6: empty, with field errors and the rejection, with the config unconfirmed, and after filing with the model unavailable
  - drawing, a running trial, the failure frame, the correction diff, the press (its excited beat), the Engineering Report and My department, each on desktop and at 390 px
  - a gallery record page at 1440 and 390 px
- axe leaves `color-contrast` and `color-contrast-enhanced` *incomplete* on board and card nodes it cannot resolve (SVG text and text over graphics). Those nodes are not tested by axe; see the manual items.
- Keyboard: a build is filed, paused with Space, sped up, its report saved as an image and a new form filed with the keyboard alone. Tab walks every stop of the form, the paused board, the report and the static front door, and each stop shows an outline of at least 2 px.
- Layout: every state above, filled with the longest legal text, is checked at 320, 375, 390, 768, 1024 and 1440 CSS px, each in portrait and landscape. The checks are no horizontal page overflow and no element wider than the viewport; up to 390 px they also require every link, button and field to be at least 52 × 52 px.
- The same checks run at 400 percent zoom (320 × 256 CSS px, that is 1280 × 1024 at 400 percent) and with the browser's default font size doubled (200 percent text, at 1440 and at 390 px).
- `apps/web/src/styles/tokens.test.ts` checks every text and surface token pair at 7:1 or more. Unit tests cover reduced motion (BuildDesk, Engineer) and captions (Voice).

**Not run:**

- Firefox and WebKit: their Playwright builds are not installed on the Debian 13 machine used, so neither was run. Installing them is a maintainer decision.
- A raised browser *minimum* font size: Chromium exposes no setting for it through Playwright, so only the doubled default font size was tested.

**Intentional internal scrolling:** none. Every state reflows into the page's own vertical scroll.

**Manual checklist** (to be completed and dated by a person):

The maintainer performs and dates this checklist before the production release in #23, which is gated on it.

- [ ] Screen reader through one build (filing, the trials, the correction, the press, the report)
- [ ] Keyboard-only through one build in a real browser, focus visible throughout
- [ ] 400 percent browser zoom and 200 percent text-only zoom in a real browser
- [ ] Reduced motion switched on: every state legible, the press shown at rest
- [ ] Captions shown for every spoken line
- [ ] Board, diff, press and rig checked by eye at phone and desktop widths, including the contrast nodes axe left incomplete. An agent's look at screenshots of these at 390 and 1440 px found the Minutes numbers outgrowing their gutter, which is now fixed; it is not a substitute for this check.

## How we measured

To be written from `eval/results/` once #19 lands.

## Licence

MIT, in [`LICENSE`](LICENSE). Font licences are listed in [`NOTICES.md`](NOTICES.md).

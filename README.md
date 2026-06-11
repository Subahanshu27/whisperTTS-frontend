# Floyo Design System

> Browser-based AI workflow platform where creators and teams discover, run, and publish open-source ComfyUI workflows instantly.

A pixel-art-meets-fruit-stand brand. Deep ube-violet primary with a fruity multi-hue accent palette (Lemon, Mint, Raspberry, Blueberry, Tangerine, Strawberry). Typography is **single-family Roboto** — 800 for display, 600 for headlines and accents, 400 for body, with uppercase + tracked variants for decorative kickers. Iconography is **all pixel-art** — every glyph is built from 2px-square paths. The vibe is playful, technical, and a little retro-arcade — built for creators, not enterprise dashboards.

---

## Sources

- **Figma file:** `Floyo! [DESIGN SYSTEM].fig` — 3 pages, 18 frames
  - `/Cover-image` — splash & "Design system" cover (mint-on-forest)
  - `/Branding-Elements` — Logo (light/dark), Colors (8 fruit scales × 10 stops + shades), Typography (desktop + mobile specimens)
  - `/Icons` — ~140 pixel icons across Social / Misc / UI clusters, plus the Verified Workflow badge and Alpha Tester badge
- **Codebase:** _none provided._ All component recreations come from the Figma definitions.

---

## Index

```
README.md                 ← this file (context, fundamentals, foundations, iconography)
SKILL.md                  ← Agent-Skills entrypoint
colors_and_type.css       ← All CSS vars + utility classes (drop-in)
assets/
  floyo-logo-light.svg    ← Wordmark, light variant
  floyo-logo-dark.svg     ← Wordmark, dark variant
  icons/                  ← ~75 pixel-art SVG icons (24×24, 2px grid)
preview/                  ← Design-system review cards (registered for the DS tab)
ui_kits/
  app/                    ← Floyo workflow-runner UI kit (in progress)
```

> **Type stack** — three brand fonts, self-hosted in `/fonts`:
> - **Roboto** (variable, both axes) — UI, body, headlines
> - **Janeiro** — chunky 70s display + decorative kickers
> - **Arcade Pixel Neue** — 8-bit retro headlines / title ramp
> All three are wired via `@font-face` in `colors_and_type.css`.** for Arcade Pixel Neue (8-bit pixel display). Please drop original `.ttf` files into `fonts/` if you have them and we'll wire them in.

---

## Brand snapshot

- **Name** — Floyo (always title-case "Floyo," never all-caps, never lowercase wordmark unless the logo SVG is used)
- **Wordmark** — custom hand-lettered "floyo." with a period dot; light variant (white on dark) and dark variant (deep-violet on light)
- **Primary color** — Ube Violet `#8358D4` (ube = purple yam, on-brand to Floyo's fruit palette naming)
- **Cover statement** — bright mint type (`#3CE195`) on deep forest (`#01341C`); confident, retro, alive

---

## Content Fundamentals

Floyo's tone is **friendly, hands-on, and a little playful** — they call their color scales _Lemon, Mint, Raspberry_, not "warning yellow / success green / danger red." That same quality runs through copy.

**Voice & tone**
- **You-centric.** Talk to the user directly: _"Run your workflow,"_ _"Publish to your library,"_ _"Your nodes."_ Avoid corporate "we believe in…"
- **Verbs first.** Action-oriented headlines. _"Run any ComfyUI workflow in the browser."_ Not _"A platform that enables…"_
- **Plain words.** Real verbs over jargon: _run, publish, share, fork, remix, save_. No "leverage / utilize / synergize."
- **Confident & specific.** _"Instantly,"_ _"in seconds,"_ _"one click"_ — claim the speed without superlative slop.
- **Light personality.** Cheeky labels (_Alpha Tester_ badge, fruit-named colors, _"Verified Workflow"_ pixel badge) are encouraged. Don't go full memes.

**Casing**
- **Sentence case** for all UI: buttons, menu items, dialog titles, page headers. _"Create new workflow"_ — not _"Create New Workflow."_
- **UPPERCASE TRACKED** only for short labels and primary buttons (`.button-l`, `.button-s`, `.accent-s`) — 10% letter-spacing.
- **Title Case** is reserved for proper nouns and product/feature names: _Floyo, ComfyUI, Verified Workflow, Alpha Tester_.

**Pronouns**
- _Your_ workflows, _your_ models, _your_ runs. The product belongs to the user.
- _We_ is fine in changelog and docs context (_"We added…"_), avoided in marketing surfaces.

**Emoji**
- **No emoji** in product UI, buttons, headers, or empty states. Pixel icons replace every place you'd reach for an emoji.
- A single 🍓/🍋 sticker-style accent in marketing is acceptable as a stand-in for the fruit palette, but never load-bearing.

**Examples**
- ✅ "Run any ComfyUI workflow — right in your browser."
- ✅ "Publish to your gallery in one click."
- ✅ "8 nodes connected — looks good."
- ❌ "Empower creators to leverage cutting-edge AI workflows." (jargon)
- ❌ "Workflow Created Successfully! 🎉" (Title Case + emoji)
- ❌ "We're so excited to share…" (we-centric, not action-first)

---

## Visual Foundations

**Color**
- The system is built on a single primary — **Ube Violet** (10-step scale, hero = `#8358D4`) — paired with a neutral **Grape** (purple-tinted text scale, used for muted/secondary text instead of grey).
- Accent palette is **fruit-themed**: Lemon, Mint, Raspberry, Blueberry, Tangerine, Strawberry. Use them sparingly — one accent per surface, not all six.
- Backgrounds default to **white** with violet-tinted neutrals (`--bg-subtle: #F7F1FF`). Inverted surfaces use **two distinct deep colors** — never pure black.
- Semantic mapping: **Mint = success**, **Raspberry = danger**, **Lemon = warning**, **Blueberry = info**.

**Inverted surfaces — Ube vs Cobalt** _(updated 26-05)_
Floyo has _two_ deep surfaces, picked by audience:
- **Ube `#1A0C34`** (`--bg-inverted`) — the **playful / product / creator** surface. Use on the workflow runner, the marketing creator pages, gallery, etc.
- **Cobalt `#101844`** (`--bg-cobalt`) — the **technical / API / developer** surface. Use on docs, API endpoint pages, code-snippet panels, dev marketing. Cobalt's accent ladder (`#7396FF` → `#A4BEFF` → `#D3DCFF`) replaces violet's (`#AF7FF4` → `#D5B8FF` → `#E6D4FF`) as text/link/border colors.

Apply with the `.surface-violet` or `.surface-cobalt` modifier on a section wrapper — child components that read `--fg`, `--fg-muted`, `--border`, `--accent` automatically flip. Don't hand-pick on-dark colors per element.

Cobalt is **not** a replacement for Blueberry (`#409AEB`, info-blue). Cobalt is darker and more saturated; it's a _surface_ family, not an accent.

**Type**
- **Roboto** — variable, weight 100–900, width 75–125%. Workhorse for all UI, body, headlines. Tight tracking (-2%) at H1/H2 sizes.
- **Janeiro** — chunky 70s display face, single weight. Use for hero titles, posters, decorative kickers, the wordmark feel. Drives `.display-*` and `.decorative-*` classes.
- **Arcade Pixel Neue** — 8-bit pixel display. Use sparingly for retro flourishes, section openers in marketing, the `.title-*` ramp.
- The two display faces are **never mixed in the same headline**. Pick one per composition.
- Letter spacing — tight on big Roboto headlines (-2%), generous on small uppercase labels (+10%).

**Backgrounds & imagery**
- Mostly flat color blocks. Floyo doesn't lean on photography or hand-drawn illustration.
- Cover/marketing surfaces use **full-bleed flat color** (forest mint, deep violet) with a single piece of pixel art or the wordmark.
- **No gradients** in product UI. Marketing may use a single soft Ube wash (`F7F1FF → FFFFFF`) but never multi-stop rainbow gradients.
- **No grain, no noise, no photography.** This is a brand of clean color and pixel sharpness.

**Animation**
- Defaults: 200ms with `cubic-bezier(.2, .8, .2, 1)` (`--ease-out`) for entrances, hover, presence.
- **No bouncy springs** in product UI. Save bouncy/squishy motion for marketing pixel-art moments.
- Loaders are pixel-style (the `loader.svg` is a pixel ring, animate by stepwise rotation, not smooth).
- Page-level transitions are fades + minor translate (4–8px), never large scale or rotate.

**Hover & press states**
- **Hover** — go _darker_, never lighter. Buttons step from `--ube-5` → `--ube-6`. Outlined / ghost buttons fill `--ube-1` (faint violet wash). Cards get `--shadow-violet` lift.
- **Press / active** — step one shade darker again (`--ube-7`) and shift down 1px (no scale-down).
- **Focus** — 2px outline in `--ube-4` with 2px offset. Always visible, never `:focus { outline: none }`.

**Borders**
- **1px** is the standard border weight (`--border: #E2E2E2` for neutral, `--border-violet: #AF7FF4` for emphasized cards).
- **Dashed violet borders** (`1px dashed var(--ube-4)`) are a brand motif — used in the Figma to mark live components and badges. Use sparingly, e.g. drop zones, "claim your spot" placeholders, alpha tags.

**Shadows**
- Restrained. The system is mostly flat.
- `--shadow-md` for floating menus / dropdowns.
- `--shadow-violet` (purple-tinted) for hover lift on workflow cards / hero CTAs.
- `--shadow-cobalt` for cards on cobalt surfaces / API marketing CTAs.
- **Pixel halo glows** — `--pixel-halo-cobalt | -violet | -mint | -lemon` are 5-layer ring stacks for pixel badges and chips on dark surfaces. Use them on `.pixel-badge` chips ("NEW!", "LIVE", "ALPHA"), the Verified Workflow sticker, and small status pills. Reserved for pixel-typed labels — don't apply to regular UI.
- No inner shadows. No multi-layer Material-style elevation.

**Radii**
- 5px is the default workhorse (`--radius-sm`) — applied to cards, banners, chips.
- 12px (`--radius-lg`) for larger cards / panels.
- 24px (`--radius-2xl`) for hero / marketing modules.
- Buttons are pill-shaped (`--radius-full`) when standalone CTAs, square-pill (8px) when inline in toolbars.

**Layout**
- 4px base spacing grid. Most rhythm lands on 8 / 16 / 24 / 32 / 48 / 80 / 120.
- Marketing content sets at **1280–1440** max-width with 80–120px gutters.
- Product UI is dense 16/24px gutters; sidebars 64px wide for icon-only nav.

**Transparency & blur**
- Used minimally. Nav bars on hero scroll get a `rgba(255,255,255,0.85) + backdrop-filter: blur(12px)` treatment. Modals use a `rgba(26, 12, 52, 0.5)` violet scrim — not pure-black overlay.

**Cards**
- White surface, 1px `--border` (or violet `--border-violet` when emphasized), 12px radius, no shadow at rest, `--shadow-violet` on hover.
- A common Floyo card pattern: thumbnail block on top (16:9 or square), title row + creator chip + run-count below. See the Workflow Card UI-kit component.

**Pixel-art rule**
- Every icon is built on a 2px grid inside a 24×24 viewbox. **Never** anti-alias them. Apply `image-rendering: pixelated` (or use `.pixelated` from the CSS) when scaling beyond 1×.

---

## Iconography

Floyo's iconography is **its single strongest visual signal**. Every glyph is **pixel art**: built from rectilinear 2px-square path segments inside a 24×24 viewport, with no curves, no anti-aliasing, no gradient. They look like Game Boy / NES sprites — chunky, charming, technical.

**System**
- ~140 icons in the Figma file, ~75 of which we've extracted to `assets/icons/`. Categories include:
  - **Social** — Discord, Github, X (Twitter), Instagram, YouTube, TikTok, LinkedIn, Facebook, Paypal, Patreon
  - **UI controls** — chevrons (4 directions, 2 sizes), arrows, close, plus, minus, check, search, edit, trash, copy
  - **Editor** — bold, italic, underline, strikethrough, bullet/number list, text columns
  - **Workflow / AI** — node, nodes, model, model-library, brain-consulting, group, command, bolt, dev
  - **Media** — image, music, video-add, camera, movie-production, volume, volume-mute
  - **State** — loader (pixel spinner), check-circle (3 sizes), info, alert, eye, eye-hide, lock-success
  - **Misc** — heart (full / half), star, flag, gift, coffee, gaming, fashion, web-design
- The Verified Workflow badge and Alpha Tester badge are pixel-art _stickers_, not flat icons. Treat them as standalone brand marks.

**Usage rules**
- Always render at **24×24** (or integer multiples: 48, 72, 96). Sub-24 sizes break the pixel grid.
- Use `image-rendering: pixelated` whenever rendered larger than 1×.
- Color: pixel icons live in `--fg` (deep ube `#1A0C34`) by default; can be tinted via `<svg fill>` or by using the icon as a `mask-image` and setting `background-color` to a brand color (the SVGs all use `currentColor`-friendly fill paths).
- **No outline-style icons.** No Lucide / Heroicons. No Material symbols. **No emoji as icons.** If a needed icon isn't in the set, build it pixel-style (or ask).
- **No mixing icon systems.** All-pixel or nothing.

**Files**
- `assets/icons/*.svg` — every glyph as a standalone SVG. The `.pixelated` utility class applies `image-rendering: pixelated`.

**Substitutions / gaps**
- We did NOT substitute any pixel icons with CDN libraries. If something is missing (e.g. play/pause, drag handle in a non-Floyo style), please flag and we'll either lift from the Figma or design it pixel-style.

---

## Logo

- **Light** — `assets/floyo-logo-light.svg` — `currentColor` paths; intended for white-on-dark or color-on-light usage. Set the parent `color:` to control fill.
- **Dark** — `assets/floyo-logo-dark.svg` — same shape, intended for the deep-violet inverted treatment.
- **Aspect ratio** — 341 × 149 (≈ 2.29 : 1). Don't squash.
- **Min size** — 96px wide on screen / 24mm in print.
- **Clearspace** — leave at least the height of the lowercase "o" (≈ 30% of logo height) on every side.
- **Don't** — recolor with gradients, add drop shadows, place on busy photography, rotate, or stack vertically.

---

## What's NOT in this system (yet)

- Real product screenshots / codebase — none provided. All UI kit work is reconstructed from the Figma type & color foundations.
- Charts / data-viz tokens.
- Motion specifics for marketing pixel sprites.
- Localized type — system was built for Latin/English only.

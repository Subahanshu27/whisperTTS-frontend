---
name: floyo-design
description: Use this skill to generate well-branded interfaces and assets for Floyo, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick reference

- **Primary color:** Ube Violet `#8358D4` (`--ube-5`)
- **Type stack:** Roboto (UI/body), Bagel Fat One (display, sub for Janeiro), VT323 (pixel, sub for Arcade Pixel Neue)
- **Tone:** friendly, action-first, sentence case for UI, UPPERCASE TRACKED for buttons; never use emoji as icons
- **Iconography:** pixel-art only, 24×24, 2px grid — `assets/icons/*.svg`
- **Drop-in CSS:** `colors_and_type.css` — all tokens + base utility classes

## File map

- `README.md` — full brand context, content fundamentals, visual foundations, iconography
- `colors_and_type.css` — every CSS var + utility class
- `assets/floyo-logo-light.svg` / `floyo-logo-dark.svg` — wordmarks
- `assets/icons/` — pixel-art SVGs
- `preview/` — design-system review cards
- `ui_kits/app/` — workflow-runner product UI kit

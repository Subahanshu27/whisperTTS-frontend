# Floyo App — UI kit

Reconstructed product surface for **Floyo**, the browser-based ComfyUI workflow runner. Source: foundations from the Figma file `Floyo! [DESIGN SYSTEM].fig` (no codebase or product screenshots were provided).

## Files

- `index.html` — single-file demo of the **Discover / Trending** surface, exercising the full component vocabulary:
  - Left brand rail (deep ube) with pixel icons
  - Sidebar navigation with grouped sections + counts
  - Hero band with title, stats, and pixel decorative
  - Filter tabs + chip controls
  - Workflow cards (thumbnail, verified badge, run count, creator chip, tags)
  - Primary / ghost button variants

## Caveats

- No product screenshots or code were provided — surfaces are inferred from the Figma typography + color foundations and from Floyo's product description (ComfyUI workflows, browser-based, creators publish/run).
- All thumbnails are gradient placeholders. Real workflow art belongs here.
- This is a single-file kit; if you want components broken into JSX (Header, Card, Button, Sidebar, Rail, etc) we can expand.
- Other product surfaces (workflow editor canvas, run page, profile, billing, marketing site) are intentionally **not** built — please flag what to prioritise.

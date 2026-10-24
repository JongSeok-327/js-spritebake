# JS SpriteBake — editor design

Selected direction: Linear, from [VoltAgent/awesome-design-md](https://github.com/voltagent/awesome-design-md/blob/main/design-md/linear.app/DESIGN.md).
The reference is an independent analysis of Linear's public website, distributed in the collection under MIT. This document adapts its palette, surface hierarchy, typography principles and control styling to this local sprite editor.

## Palette

| Role | Value |
| --- | --- |
| Canvas | `#010102` |
| Sidebar / panel | `#0f1011` |
| Input / secondary surface | `#141516` |
| Raised control | `#191a1b` |
| Main text | `#f7f8f8` |
| Secondary text | `#d0d6e0` |
| Metadata / captions | `#8a8f98` |
| Hairline | `#23252a` |
| Control border | `#34343a` |
| Primary action | `#5e6ad2` |
| Focus / selected frame | `#828fff` |

Use the accent for extraction, ZIP export, keyboard focus and selected frames. Amber identifies duplicate proposals and warnings. Preview backgrounds and the original video's pixels keep their own colors.

## Typography

Use locally installed Segoe UI Variable Text / Segoe UI, followed by Malgun Gothic for Korean. Use Cascadia Code / SFMono-Regular / Consolas for time codes and numeric inputs. This follows the reference's restrained sans and monospace pairing without requiring proprietary Linear fonts or external font downloads.

- Application name: 14px, 600.
- Document name: 15px, 550.
- Section titles: 12px, 500–600.
- Standard controls: 12px, 500.
- Setting labels and hints: 11px.
- Compact metadata: 10px.
- Use negative tracking only on application/document titles.

## Layout and components

- Preserve the editing flow: settings on the left; original and result above the frame inspector; export below.
- Header: 57px. Sidebar: 282px on desktop; 296px on wide screens.
- Use 8/12/16/24/32px spacing, 1px dividing lines and 6px control corners. Preview/inspector panels use 9px corners.
- Use a flat primary button with a quiet hover change. Secondary actions stay dark and compact.
- Set fields against the second surface, with a stronger boundary than panel dividers.
- Show six frame columns on desktop, eight on wide displays and three on phones. Each thumbnail maintains the sprite's aspect ratio inside its cell.
- Keep playback and inspection controls adjacent to their preview. Preserve visible selected, excluded and duplicate states.
- At narrow widths, stack previews and arrange settings in two columns. Keep file and frame names truncated inside their containers.
- Honor reduced-motion preferences for CSS transitions.

## Visual guardrails

The product is an editing workspace. Keep working images prominent, section labels short and status text factual. Avoid large display headings, decorative gradients, broad colored panels, brand imitation and ornamental badges. Whitespace and restrained surface contrast should establish the hierarchy.

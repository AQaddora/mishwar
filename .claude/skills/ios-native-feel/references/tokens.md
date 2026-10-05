# Design tokens

The colours are iOS-like neutrals plus one accent. The accent is a placeholder until
Mishwar has a brand colour. Every text pair below meets 4.5:1 contrast.

## Colours

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F2F2F7` | `#000000` | App background, splash, `theme-color` |
| `--surface` | `#FFFFFF` | `#1C1C1E` | Cards, sheets, tab bar |
| `--text` | `#1C1C1E` | `#FFFFFF` | Main text |
| `--text-muted` | `#6B6B70` | `#A1A1A6` | Secondary text, data age |
| `--separator` | `#D1D1D6` | `#38383A` | Hairlines, borders |
| `--accent` | `#0A7D5A` | `#3DD68C` | Primary actions, active tab |
| `--on-accent` | `#FFFFFF` | `#000000` | Text on accent |
| `--danger` | `#C62828` | `#FF6B6B` | Destructive actions, failures |
| `--pending` | `#8A6D00` | `#FFD60A` | Saved locally but not yet sent |
| `--map-ink` | `#1C1C1E` | `#1C1C1E` | Route lines and stop pins drawn on the map. The map tiles are always light, so it doesn't flip |
| `--map-paper` | `#FFFFFF` | `#FFFFFF` | The inside of a stop pin on the map |
| `--map-mute` | `#E5E5EA` | `#E5E5EA` | The mask over everything outside the Gaza Strip on the map |

## Spacing (Tailwind steps only)

| px | 4 | 8 | 12 | 16 | 24 | 32 |
|---|---|---|---|---|---|---|
| Tailwind | `1` | `2` | `3` | `4` | `6` | `8` |

## Radius

| Token | px | Use |
|---|---|---|
| `--radius-control` | 8 | Buttons, inputs |
| `--radius-card` | 12 | Cards, list groups |
| `--radius-sheet` | 20 | Sheet top corners |

## Type

| Token | px / weight | Use |
|---|---|---|
| `--text-large-title` | 34 / 700 | Screen titles before scroll |
| `--text-title` | 22 / 700 | Compact titles, section heads |
| `--text-body` | 17 / 400 | Body and every input (never below 16) |
| `--text-caption` | 13 / 400 | Labels, data age, tab labels |

## Fixed sizes

- Minimum touch target: 44px.
- Tab bar: 49px plus `env(safe-area-inset-bottom)`.

## Wiring (Tailwind v4)

```css
@import "tailwindcss";

:root {
  color-scheme: light dark;
  --bg: #F2F2F7; --surface: #FFFFFF; --text: #1C1C1E; --text-muted: #6B6B70;
  --separator: #D1D1D6; --accent: #0A7D5A; --on-accent: #FFFFFF;
  --danger: #C62828; --pending: #8A6D00;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #000000; --surface: #1C1C1E; --text: #FFFFFF; --text-muted: #A1A1A6;
    --separator: #38383A; --accent: #3DD68C; --on-accent: #000000;
    --danger: #FF6B6B; --pending: #FFD60A;
  }
}
@theme inline {
  --color-bg: var(--bg); --color-surface: var(--surface); --color-text: var(--text);
  --color-text-muted: var(--text-muted); --color-separator: var(--separator);
  --color-accent: var(--accent); --color-on-accent: var(--on-accent);
  --color-danger: var(--danger); --color-pending: var(--pending);
  --radius-control: 8px; --radius-card: 12px; --radius-sheet: 20px;
}
```

Keep the manifest `background_color` and `theme_color`, and the `theme-color` meta tags
(with light and dark `media`), equal to `--bg`.

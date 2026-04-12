# Harris Porsche — Style Spec
## Platform
- Next.js + Porsche Design System (PDS) v3.33.0
- CDN: `cdn.ui.porsche.com/porsche-design-system/`
- Site URL: harris.porsche.com

## Typography
- **Font:** Porsche Next
  - Regular: `https://cdn.ui.porsche.com/porsche-design-system/fonts/porsche-next-latin-regular.b8f1c20.woff2`
  - Semi-Bold: `https://cdn.ui.porsche.com/porsche-design-system/fonts/porsche-next-latin-semi-bold.b5f6fca.woff2`
  - CSS font stack: `'Porsche Next', 'Arial Narrow', Arial, 'Heiti SC', SimHei, sans-serif`
- Line height: `calc(6px + 2.125ex)` (fluid)
- Letter spacing: normal

## Colors
- Text: `#010205` (near black)
- Background light: `#FFF`
- Background dark: `#0E1418`
- Surface: `#EEEFF2`
- Overlay: `rgba(1,2,5,0.67)`
- Focus ring: `#1A44EA`
- **NO brand accent color** — Porsche uses black/white/gray exclusively
- Contrast low: `rgba(148,149,152,.18)` (hover states)

## Border Radius
- Buttons: `4px`
- Cards: `4px`
- (Very different from BMW's 0 radius)

## Buttons
- Use Porsche Design System web components
- `<p-button>` — primary button (glassmorphism style)
- `<p-button-pure>` — text/icon button
- `<p-link>` — link
- NO bright colored CTA buttons — all monochromatic

## Content Sections (Tailwind classes used)
- `prose-heading-sm/md/lg/xl` — heading sizes
- `prose-text-sm/md` — body text
- `text-contrast-medium` — secondary text color
- `bg-canvas` — page background
- `border-contrast-low` — subtle borders
- `rounded-sm` — 4px radius
- `p-fluid-md/lg` — fluid padding
- `gap-fluid-sm/md/lg` — fluid gaps

## Content-only HTML approach
When building content-only sections for this CMS:
- Link Porsche Next font from their CDN
- Use their Tailwind utility classes for typography
- NO bright colors in CTAs — use dark/black buttons
- Small 4px radius on all interactive elements
- Clean, minimal, premium aesthetic
- White space is a design element — don't pack content

## CSS to link in content HTML
```html
<link rel="stylesheet" href="https://cdn.ui.porsche.com/porsche-design-system/styles/font-face.7076ba0.css" type="text/css" crossorigin=""/>
```

## Button pattern for content HTML
```html
<!-- Primary dark button -->
<a href="/en/inventory/porsche/search?condition=new&modelSeries=cayenne"
   style="display:inline-flex;align-items:center;gap:8px;background:#010205;color:#fff;padding:13px 24px;font-family:'Porsche Next','Arial Narrow',Arial,sans-serif;font-size:1rem;font-weight:400;border:none;cursor:pointer;text-decoration:none;border-radius:4px;letter-spacing:normal;">
  View Cayenne Inventory
</a>

<!-- Secondary outline button -->
<a href="/en/test-drive"
   style="display:inline-flex;align-items:center;gap:8px;background:transparent;color:#010205;padding:11px 24px;font-family:'Porsche Next','Arial Narrow',Arial,sans-serif;font-size:1rem;font-weight:400;border:2px solid #010205;cursor:pointer;text-decoration:none;border-radius:4px;">
  Request Test Drive
</a>
```

## Key differences vs BMW/Motive
| | BMW (Motive) | Porsche (PDS) |
|--|--|--|
| Primary color | #1C69D3 (blue) | #010205 (black) |
| Border radius | 0px | 4px |
| Font | BMW Type Next | Porsche Next |
| Button style | Bold blue fill | Dark minimal |
| Design language | Athletic/sport | Minimalist/premium |
| Platform | Next.js/Motive | Next.js/PDS web components |

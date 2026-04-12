# Audi Baton Rouge — Style Spec
## Platform
- **Same Motive platform as Brian Harris BMW** — Next.js, identical CSS module class names
- Site URL: audibatonrouge.com
- All BMW page structure/class patterns apply directly

## Key Difference: DARK THEME
Audi BR uses a **dark/black theme** — complete opposite of BMW's light theme.

## CSS Variables (from motive-theme-provider)
```
--primary: #ffffff (WHITE — buttons are white, not color)
--on-primary: #000000 (black text on white buttons)
--surface: #000000 (BLACK background)
--surface-background: #000000
--elevated-level-one: #1a1a1a
--elevated-level-two: #2b2b2b
--text-primary: #FFF (white text)
--text-secondary: #BDBDBD (gray text)
--border-soft: 1px solid #4D4D4D
--border-strong: 1px solid #707070
--radius-full: 0 (zero radius — same as BMW)
--radius-lg: 0
--radius-md: 0
--radius-sm: 0
```

## Typography
- Font family: `Audi` (custom Audi font)
- Header font: `AudiStretch`
- Icon font: `Material Symbols Outlined` (NOT Sharp like BMW)
- Same fluid sizing system as BMW/Motive

## Colors
- Background: `#000000` (pure black)
- Text: `#FFFFFF` (white)
- Secondary text: `#BDBDBD` (gray)
- Borders: `#4D4D4D` / `#707070`
- Primary/CTA buttons: **white with black text** (inverted from BMW's blue buttons)
- No brand accent color — pure monochromatic black/white

## Button pattern
```html
<!-- Primary (white button) -->
<a class="Button-module-scss-module__u3qYVW__button Button-module-scss-module__u3qYVW__button--large Button-module-scss-module__u3qYVW__button--fit Button-module-scss-module__u3qYVW__button--themePrimary"
   href="/cars/new-q5s"
   style="display:inline-flex;align-items:center;background:#fff;color:#000;padding:16px 24px;font-size:16px;font-weight:400;border:none;cursor:pointer;text-decoration:none;border-radius:0;">
  Shop Q5 Inventory
</a>
```

## Content sections — identical class structure to BMW
- `Section-module-scss-module__OULvSq__section--limitedWidth` — standard content width
- `Header-module-scss-module__EbUWaq__header` — H2 headers
- `Paragraph-module-scss-module__X9rQPG__container` — body text
- `Text-module-scss-module__Iw40ma__text--h1/h2` — headings
- `Text-module-scss-module__Iw40ma__text--bodyLarge` — body copy
- `Text-module-scss-module__Iw40ma__text--textPrimary` — uses CSS var (white on Audi, dark on BMW)

## Page structure (from actual ABR Q5 vs GLC page)
1. Hero — full width, background image, white H1 + subtitle left-aligned
2. Spacer — `1.0%` padding top
3. Paragraph — intro copy (no header above it)
4. Button row — 4 CTAs centered: Shop Inventory, Schedule Test Drive, Value Trade, Get Pre-Qualified
5. H2 Header → Paragraph → (repeat)
6. Button rows interspersed every 2-3 sections
7. Collection widget (live inventory feed)
8. Map section

## Navigation note
ABR uses `GlassNavBar` (semi-transparent) vs BMW's solid nav — same class structure underneath

## Content-only HTML approach for ABR pages
- Same `<section>` block structure as BHBMW pages
- Background colors flip: use `background:#000` for dark sections, `background:#1a1a1a` for elevated
- Text color: `color:#fff` everywhere (not `#221F1F` like BMW)
- Buttons: white bg, black text, 0 radius
- Hero: dark/black overlay on image (not transparent gradient)

## Button pattern (content-only HTML)
```html
<!-- Primary white button -->
<a href="/cars/new-q5s"
   style="display:inline-flex;align-items:center;background:#fff;color:#000;padding:16px 28px;font-size:16px;font-weight:400;border:none;cursor:pointer;text-decoration:none;border-radius:0;margin-right:12px;">
  Shop Q5 Inventory
</a>

<!-- Outline button -->
<a href="/service"
   style="display:inline-flex;align-items:center;background:transparent;color:#fff;padding:14px 28px;font-size:16px;font-weight:400;border:2px solid #fff;cursor:pointer;text-decoration:none;border-radius:0;">
  Schedule Service
</a>
```

## Key differences vs BHBMW (Motive)
| | BHBMW (BMW) | ABR (Audi) |
|--|--|--|
| Theme | Light (#F6F6F6 bg) | Dark (#000 bg) |
| Primary color | #1C69D3 (blue) | #ffffff (white) |
| Button style | Blue fill | White fill |
| Text color | #221F1F | #FFF |
| Font | BMW Type Next | Audi / AudiStretch |
| Platform | Motive (same) | Motive (same) |
| Border radius | 0 | 0 |
| Icon font | Material Symbols Sharp | Material Symbols Outlined |

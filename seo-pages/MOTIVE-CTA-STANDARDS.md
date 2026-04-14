# Motive CTA Standards — The Cooperative Agency

This document defines the correct button/link patterns for all SEO and content pages built for Motive-hosted dealership sites. Always reference this before building or reviewing pages.

---

## How Motive CTAs Work

Motive pages have two types of CTAs:
1. **Modal buttons** — `<button>` elements with specific Motive class names. Motive's JS listens for clicks and fires a built-in tool (test drive scheduler, trade-in tool, etc.). These ONLY work when the page is hosted on the Motive platform.
2. **Link CTAs** — standard `<a href>` elements pointing to internal Motive pages.

**On our GitHub Pages previews**, modal buttons will appear but do nothing on click. That's expected — they only fire when hosted on the actual dealer site.

---

## Modal Button Patterns (Same for ALL Motive BMW stores)

### Schedule A Test Drive
```html
<button aria-label="Schedule A Test Drive" class="Button-module-scss-module__u3qYVW__button Button-module-scss-module__u3qYVW__button--large Button-module-scss-module__u3qYVW__button--fit Button-module-scss-module__u3qYVW__button--themePrimary" type="button" aria-busy="false"><p class="Text-module-scss-module__Iw40ma__text Text-module-scss-module__Iw40ma__text--bodyRegular Text-module-scss-module__Iw40ma__text--textPrimary Text-module-scss-module__Iw40ma__text--left Text-module-scss-module__Iw40ma__text--regular Button-module-scss-module__u3qYVW__buttonText Button-module-scss-module__u3qYVW__buttonText--bold"><span class="Text-module-scss-module__Iw40ma__textContent">Schedule A Test Drive</span></p></button>
```

### Value My Trade
```html
<!-- Value My Trade — Motive modal button -->
<button aria-label="Value My Trade" class="Button-module-scss-module__u3qYVW__button Button-module-scss-module__u3qYVW__button--large Button-module-scss-module__u3qYVW__button--fit Button-module-scss-module__u3qYVW__button--themePrimary" type="button" aria-busy="false"><p class="Text-module-scss-module__Iw40ma__text Text-module-scss-module__Iw40ma__text--bodyRegular Text-module-scss-module__Iw40ma__text--textPrimary Text-module-scss-module__Iw40ma__text--left Text-module-scss-module__Iw40ma__text--regular Button-module-scss-module__u3qYVW__buttonText Button-module-scss-module__u3qYVW__buttonText--bold"><span class="Text-module-scss-module__Iw40ma__textContent">Value My Trade</span></p></button>
```

### Get Pre-Qualified (Brian Harris BMW specifically)
```html
<!-- Get Pre-Qualified — regular link -->
<a href="https://brianharrisbmw.com/pre-qualify" class="Button-module-scss-module__u3qYVW__button Button-module-scss-module__u3qYVW__button--large Button-module-scss-module__u3qYVW__button--fit Button-module-scss-module__u3qYVW__button--themePrimary Link-module-scss-module__wpnGQa__link--bmw" draggable="false" tabindex="0"><p class="Text-module-scss-module__Iw40ma__text Text-module-scss-module__Iw40ma__text--bodyRegular Text-module-scss-module__Iw40ma__text--textPrimary Text-module-scss-module__Iw40ma__text--left Text-module-scss-module__Iw40ma__text--regular Button-module-scss-module__u3qYVW__buttonText Button-module-scss-module__u3qYVW__buttonText--bold"><span class="Text-module-scss-module__Iw40ma__textContent">Get Pre-Qualified</span></p></a>
```

---

## Link CTA Patterns by Store

### Brian Harris BMW (brianharrisbmw.com)
| CTA | Type | URL |
|-----|------|-----|
| Value My Trade | Modal button | (Motive tool) |
| Get Pre-Qualified | Link | https://brianharrisbmw.com/pre-qualify |
| Shop New Inventory | Link | https://brianharrisbmw.com/inventory |
| Shop X3 | Link | https://brianharrisbmw.com/cars/bmw-x3 |
| Shop X5 | Link | https://brianharrisbmw.com/cars/bmw-x5 |
| Shop X7 | Link | https://brianharrisbmw.com/cars/bmw-x7 |
| Shop 3 Series | Link | https://brianharrisbmw.com/cars/new-3-series |
| Shop 5 Series | Link | https://brianharrisbmw.com/cars/new-5-series |
| Schedule Service | Link | https://brianharrisbmw.com/service |
| Contact Us | Link | https://brianharrisbmw.com/contact |
| Test Drive | Modal button | See above |

### BMW of Jackson (bmwofjackson.com)
| CTA | Type | URL |
|-----|------|-----|
| Value My Trade | Link | https://bmwofjackson.com/trade |
| Get Pre-Qualified | Link | https://bmwofjackson.com/pre-qualify |
| Shop New Inventory | Link | https://bmwofjackson.com/inventory |
| Schedule Service | Link | https://bmwofjackson.com/service |
| Test Drive | Modal button | See above (same Motive classes) |

### Audi Baton Rouge (audibatonrouge.com)
| CTA | Type | URL |
|-----|------|-----|
| Value My Trade / Sell or Trade | Link | https://audibatonrouge.com/sell-or-trade |
| Get Pre-Qualified | Link | https://audibatonrouge.com/get-pre-qualified |
| Shop New Inventory | Link | https://audibatonrouge.com/inventory |
| Schedule Service | Link | https://audibatonrouge.com/service |
| Test Drive | Modal button | See above (same Motive classes) |

### Harris Porsche (harrisporsche.com)
| CTA | Type | URL |
|-----|------|-----|
| Shop New Inventory | Link | https://harrisporsche.com/inventory |
| Contact Us | Link | https://harrisporsche.com/contact |
| Schedule Service | Link | https://harrisporsche.com/service |
| *Note: Harris Porsche uses Porsche OEM platform (PDS), not Motive. Button classes are different.* | | |

---

## Rules

1. **Never use relative URLs** (`/inventory`, `/trade`) — always use full absolute URLs
2. **Never use `href` for test drive or trade-in** on BMW/Audi pages — always use the Motive modal `<button>`
3. **Always verify links are live** before sending pages to Dessrae/Motive for implementation
4. **ABR trade link** — use KBB URL (pending) not `/value-my-trade` until confirmed

---

## Contacts for Implementation

| Store | Platform | Contact | Email |
|-------|----------|---------|-------|
| BHBMW, ABR, BMW Jackson | Motive | Dessrae Edison | dessrae.edison@motivehq.com |
| Harris Porsche | Porsche OEM (PDS) | Cody Vander Veen | cody.vanderveen@porsche.us |

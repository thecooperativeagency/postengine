# Social Post Manager — Build Instructions

## What This App Is
A social media content management dashboard for an automotive marketing agency that manages 4 luxury car dealerships:
- BMW of Jackson (bmwofjackson.net)
- Brian Harris BMW (brianharrisbmw.com)
- Audi Baton Rouge (audibatonrouge.com)
- Harris Porsche (harrisporsche.com)

The app lets the user:
1. See all posts across dealerships in a dashboard
2. Create/edit posts with captions, hashtags, CTA blocks, and media
3. Review and approve posts before publishing (queue → approved → scheduled → published)
4. Filter by dealership, status, and post type
5. View a calendar of scheduled posts
6. See activity log

## Backend Already Done
The schema (`shared/schema.ts`), storage (`server/storage.ts`), and routes (`server/routes.ts`) are complete with seed data. Just build the frontend.

## Art Direction — Automotive Luxury
This is a professional tool for luxury auto marketing. The aesthetic should be:
- **Dark, sophisticated palette** — charcoal/slate surfaces, not pure black
- **Primary accent**: Deep teal `#0D7C83` for CTAs and active states
- **Warm neutrals** for surfaces — not cold gray
- **Typography**: Clean, modern — use Satoshi from Fontshare for body, General Sans for headings

### Color Palette (HSL for index.css)
Light mode:
- background: 40 15% 96%
- foreground: 220 15% 12%
- card: 40 12% 98%
- card-foreground: 220 15% 12%
- popover: 40 12% 96%
- popover-foreground: 220 15% 12%
- primary: 184 82% 28%
- primary-foreground: 0 0% 100%
- secondary: 40 8% 92%
- secondary-foreground: 220 15% 12%
- muted: 40 8% 93%
- muted-foreground: 220 5% 45%
- accent: 40 10% 90%
- accent-foreground: 220 15% 12%
- destructive: 0 72% 45%
- destructive-foreground: 0 0% 100%
- border: 40 8% 85%
- input: 40 8% 78%
- ring: 184 82% 28%
- sidebar: 220 12% 14%
- sidebar-foreground: 40 8% 90%
- sidebar-border: 220 10% 20%
- sidebar-primary: 184 70% 40%
- sidebar-primary-foreground: 0 0% 100%
- sidebar-accent: 220 10% 20%
- sidebar-accent-foreground: 40 8% 90%
- sidebar-ring: 184 70% 40%

Dark mode:
- background: 220 15% 8%
- foreground: 40 8% 90%
- card: 220 12% 11%
- card-foreground: 40 8% 90%
- popover: 220 12% 12%
- popover-foreground: 40 8% 90%
- primary: 184 60% 42%
- primary-foreground: 220 15% 8%
- secondary: 220 10% 18%
- secondary-foreground: 40 8% 90%
- muted: 220 10% 20%
- muted-foreground: 40 5% 55%
- accent: 220 10% 18%
- accent-foreground: 40 8% 90%
- destructive: 0 72% 50%
- destructive-foreground: 0 0% 100%
- border: 220 8% 20%
- input: 220 8% 25%
- ring: 184 60% 42%
- sidebar: 220 15% 10%
- sidebar-foreground: 40 8% 85%
- sidebar-border: 220 10% 16%
- sidebar-primary: 184 60% 45%
- sidebar-primary-foreground: 0 0% 100%
- sidebar-accent: 220 10% 16%
- sidebar-accent-foreground: 40 8% 85%
- sidebar-ring: 184 60% 45%

Chart colors (light): chart-1: 184 70% 35%, chart-2: 220 50% 45%, chart-3: 0 65% 45%, chart-4: 40 70% 50%, chart-5: 280 40% 50%
Chart colors (dark): chart-1: 184 60% 50%, chart-2: 220 50% 60%, chart-3: 0 55% 55%, chart-4: 40 70% 60%, chart-5: 280 40% 60%

## Pages to Build

### 1. Dashboard (/)
- KPI cards across top: Total Posts, Drafts, Queued, Scheduled, Published
- Dealership cards showing per-store stats with colored accent matching brand color
- Recent activity feed
- Quick-action buttons: New Post, Review Queue

### 2. Posts (/posts)
- Filterable table/list of all posts
- Filter bar: dealership dropdown, status tabs (All, Draft, Queued, Scheduled, Published), post type
- Each post row shows: dealership name, vehicle/subject, status badge, platforms, scheduled date, actions
- Click to expand/edit inline or open detail view
- Bulk select + bulk approve button

### 3. Create/Edit Post (/posts/new, /posts/:id)
- Form with:
  - Dealership selector (dropdown with brand colors)
  - Post type: inventory, promo, lifestyle, announcement
  - Vehicle info text field
  - Caption textarea (large, ~40 word target)
  - Hashtags field (6 hashtags)
  - CTA block (auto-populated from dealership template)
  - Platform checkboxes: Instagram, Facebook, TikTok
  - Schedule date/time picker
  - Media type selector
- Live preview panel on the right showing how the post will look (phone mockup not needed, just a clean preview card)
- Save as Draft, Queue for Review, or Schedule buttons

### 4. Review Queue (/queue)
- Shows only posts with status "queued"
- Card-based layout — each card shows the full post preview
- Approve (→ scheduled), Edit, or Reject buttons on each
- Bulk approve capability

### 5. Calendar (/calendar)
- Monthly calendar grid
- Dots/indicators on days with scheduled posts
- Click a day to see posts scheduled for that day
- Color-coded by dealership

### 6. Settings (/settings)
- Dealership management cards
- Edit dealership details, CTA template, social handles
- Zernio API key input (placeholder for future integration)
- Google Drive folder path configuration (placeholder)

## Sidebar
- Dark sidebar (per the palette above)
- App logo/name at top: "PostEngine" with a small SVG icon
- Nav items: Dashboard, Posts, New Post, Review Queue, Calendar, Settings
- Dealership filter at bottom of sidebar — quick switch to filter everything by one store
- Use the shadcn Sidebar component per sidebar_rules.md

## Component Quality
- Use shadcn components throughout
- Status badges with semantic colors: draft=muted, queued=warning/amber, scheduled=primary/teal, published=success/green, rejected=destructive
- Smooth transitions
- Empty states with helpful messages
- Loading skeletons
- Dark mode support (toggle in header)
- Use the elevate system for hover states

## Fonts
Load in client/index.html:
```html
<link href="https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700&f[]=general-sans@400,500,600,700&display=swap" rel="stylesheet">
```

Set in tailwind.config.ts:
```
fontFamily: {
  sans: ['Satoshi', 'sans-serif'],
  display: ['General Sans', 'sans-serif'],
}
```

## API Endpoints Available
- GET /api/dashboard — stats, dealerships with counts, recent activity
- GET /api/dealerships — all dealerships
- GET /api/dealerships/:id
- PATCH /api/dealerships/:id
- GET /api/posts?dealershipId=&status=&postType=
- GET /api/posts/stats
- GET /api/posts/:id
- POST /api/posts
- PATCH /api/posts/:id
- DELETE /api/posts/:id
- POST /api/posts/bulk-approve { ids: number[] }
- GET /api/activity?limit=

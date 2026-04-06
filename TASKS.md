# TASKS.md — Overnight Build Queue

Tasks here get picked up by the overnight cron and built by Claude Code while Lance sleeps.
Each task gets one coding agent session. Results are committed to GitHub and Lance gets a Telegram summary in the morning.

## Format

```
## [STATUS] Task Title
- **Priority:** high | medium | low
- **Repo:** github.com/thecooperativeagency/reponame (or "new repo")
- **Spec:** Clear description of what to build. Be specific — the agent reads this directly.
- **Done when:** Acceptance criteria. How do we know it's finished?
```

Status options: `QUEUED` → `IN_PROGRESS` → `DONE` | `FAILED`

---

## Queue

## [HOLD] Avec Tous Provisions — Landing Page
- **Priority:** high
- **Repo:** new repo (avectous-landing)
- **Spec:** Build a clean, beautiful landing page for avectousprovisions.com — Avec Tous Provisions & Spice. Louisiana spice company owned by chefs. Brand vibe: authentic, warm, Southern, bold. Dark background, rich colors (deep red, cream, black). Sections: hero with tagline "A Perfectly Balanced Louisiana Seasoning", brand story (3 former chefs, Louisiana roots, eclectic melting pot), product teaser (OG Blend, Spicy Blend, coming soon), email signup ("Be first when we relaunch — drop your email"), footer with social links (@avectousspice). No e-commerce yet — just brand story + email capture. Mobile-first. Deploy-ready HTML/CSS/JS (no framework needed). Include a README with deployment instructions.
- **Done when:** Clean single-page site built, looks great on mobile, email signup form works (can use Netlify Forms or Formspree for capture), committed to git.


## [IN_PROGRESS] App Market Research — FridgeDrop ## [QUEUED] App Market Research — FridgeDrop & Photography Tools Photography Tools
- **Priority:** high
- **Repo:** new repo (research doc only, no code)
- **Spec:** Deep market research on two app ideas for Lance Faucheux / The Cooperative Agency. 
  1. FridgeDrop — AI fridge photo → recipe recommendations. Research: Yummly shutdown impact, displaced user volume, SuperCook weaknesses, top App Store competitors in "recipe from ingredients" category, pricing benchmarks, monetization models that work in food apps.
  2. ShotBrief — AI photo shoot briefing tool for photographers. Research: existing tools (if any), photographer pain points around client briefing, market size, pricing benchmarks for B2B photography tools.
  Compile findings into a clean markdown report at /Users/lucfaucheux/.openclaw/workspace/research/app-ideas-report.md
- **Done when:** Report exists with competitor analysis, market size estimates, pricing benchmarks, and a clear go/no-go recommendation for each app.


---

## Completed

_Nothing completed yet._

## [QUEUED] Envie Tous — React Native App MVP Scaffold
- **Priority:** high
- **Repo:** new repo (envie-tous-app) under thecooperativeagency GitHub
- **Spec:** Build a React Native MVP scaffold for Envie Tous — an authentic Southern/Louisiana recipe app. Brand: warm, rich, Southern. Colors: deep red, cream, black. No real logos — use text placeholders "ENVIE TOUS" everywhere.

  Screens to build:
  1. **Home/Discover** — hero tagline "Cook what you're craving", featured recipe cards, browse by category (Louisiana Classics, Spicy, Seasonal, etc.)
  2. **Recipe Detail** — photo placeholder, ingredients with pot-size scaler (serves 2 / 4 / 8 / 20+), step-by-step instructions, "Made with Avec Tous [blend]" callout, save button
  3. **Browse/Search** — filter by category, ingredient, spice blend
  4. **Saved Recipes** — user's saved collection
  5. **Taste Profile** — onboarding: pick cuisines you love, dietary needs (paleo toggle etc), spice tolerance
  6. **Fridge Scan** — camera screen, "What's in your fridge?" — secondary feature, simple UI

  Seed data: Include 3 placeholder recipes — Jambalaya, Gumbo, Crawfish Étouffée. Proper Louisiana recipes with real ingredients (Lance will replace with his versions later). Each tagged with OG Blend spice.

  Tech stack: React Native + Expo (easiest path to App Store), React Navigation, simple JSON recipe store for now (no backend yet).

  Include README with how to run locally and next steps for App Store submission.

- **Done when:** App runs on iOS simulator via Expo, all 6 screens navigate correctly, pot-size scaler works, committed to GitHub.

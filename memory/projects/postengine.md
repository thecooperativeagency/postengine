# PostEngine — Social Media Pipeline

- Location: `/Users/lucfaucheux/.openclaw/workspace/postengine/social-post-manager`
- Port: 3456 | Tailscale: http://100.83.146.27:3456
- GitHub: https://github.com/thecooperativeagency/postengine
- Start: `cd .../postengine/social-post-manager && bash start.sh`
- Stack: Express + TypeScript + SQLite (Drizzle ORM) | React + Vite + Tailwind + shadcn/ui

## Status (Active)
- ✅ 4 dealerships loaded + Zernio connected (IG + FB + GMB)
- ✅ Drive scanner, auto-archive, cadence settings, Telegram approval flow
- ✅ Instagram, GMB, Facebook publishing confirmed live
- ✅ Weekly scan cron: Sunday 2 AM CDT
- ✅ Auto media hosting: Drive → GitHub postengine/media/ → Zernio

## Drive Folders
- Brian Harris BMW: 1lYpn2ha-9NfB2DPE-c8iRETZyTo8QB_n
- BMW of Jackson: 1VrvSBEZ6ch0QgQTtNzzh-xYgxRPWpXqC
- Audi Baton Rouge: 1qA3juHq72ezNotu3NaOukfg9E-K5YKzd
- Harris Porsche: 1vWOiInvpN6HJX-NU9Iwy1Pm-s20x85Ya

## File Naming Convention
`2026-BMW-M3-Competition-Alpine-White.jpg` (Year-Make-Model-Trim-Color)

## Zernio
- Config: `.zernio-accounts.json` in PostEngine root
- Base URL: https://zernio.com/api/v1
- Token: sk_a2ea86b0...

## Open Items
- Caption formats + CTAs from Lance → bake into caption writer
- Add The Cooperative Agency as 5th client (client ID 5 = Luc OpenCRAW)
- VinSolutions lead data integration (email CSV to lucfasho@gmail.com)
- Auto-start LaunchAgent on boot

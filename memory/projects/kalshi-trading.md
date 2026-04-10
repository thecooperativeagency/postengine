# Kalshi Multi-Vertical Trading System

- Location: `/Users/lucfaucheux/.openclaw/workspace/kalshi-weather`
- Dashboard: http://localhost:3200
- Built: April 7, 2026

## Architecture
- Weather: 3-model consensus (NOAA + GFS + ECMWF)
- Arb: Polymarket vs Kalshi price discovery scanner
- Auto-trading: live mode, limit orders on high-confidence signals
- Settlement: 9am + 3pm CDT auto-check
- Cities: NYC, CHI, MIA, DAL, ATL, NOLA, LA

## Crons
- `*/30 6-22` — weather scan
- `*/15 6-23` — arb scan
- `0 14,20` — settlement check + auto next-day scan

## Signal Logic
- High confidence (all 3 models within 2°F) → lower threshold
- Medium confidence (within 4°F) → standard threshold
- Low confidence (>4°F spread) → SKIP
- Target bracket contracts $0.20-$0.60 YES only

## Kalshi API
- Key ID: e62f1ce7-b0ae-405d-8ce1-5e75064f9e08 (in .env — ROTATE THIS KEY)
- Balance: ~$40 cash
- Max trade: $25/position

## Commands
```bash
cd ~/.openclaw/workspace/kalshi-weather
npx ts-node src/index.ts --scan-once
npx ts-node src/index.ts --arb
npx ts-node src/index.ts --check-settle
npx ts-node src/index.ts --results
```

## Scale-up Plan
- Phase 1 (now-April): small live + paper, build 20+ settled trades
- Phase 2 (May, if >55% win rate): $10-25/position
- Phase 3 (Summer): $50-100/position, add economics vertical

## Open Items
- Rotate Kalshi API key (potentially exposed)
- Add BOS, PHX, SEA to weather cities
- Build economics vertical (CPI, Fed same-day contracts)

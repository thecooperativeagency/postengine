# GA4 Dashboards

## Live URLs
- BMW Jackson: https://thecooperativeagency.github.io/Ga4-dashboards/bmw-jackson-dashboard.html
- Brian Harris BMW: https://thecooperativeagency.github.io/Ga4-dashboards/brian-harris-bmw-dashboard.html
- Audi Baton Rouge: https://thecooperativeagency.github.io/Ga4-dashboards/audi-baton-rouge-dashboard.html

## Features
- Dark mode, Cooperative Agency branding
- Date range filters (30/60/90 days), YoY + sequential comparison
- Top 20 traffic sources, market-adjusted benchmarks
- Weekly auto-update: every Monday 6AM CDT
- Update script: `/Users/lucfaucheux/.openclaw/workspace/ga4-dashboards/update-dashboards.sh`

## GA4 Properties
- Brian Harris BMW: 334199347 (Account 74380124, bhbmwecommerce@gmail.com)
- Audi Baton Rouge: 381984706 (Account 82333601, bhbmwecommerce@gmail.com)
- BMW of Jackson: 255835161 (Account 118997487)
- Harris Porsche: OEM-controlled (awaiting Cody/harrisporsche738@gmail.com)

## Known Issue
- GA4 auth for bhbmwecommerce@gmail.com broken — needs re-auth with Analytics scopes
- Fix: `gog auth add bhbmwecommerce@gmail.com --services gmail,calendar,drive,sheets`

## Open Items
- Add bounce rate by URL to all 3 dashboards (blocked on GA4 auth fix)
- Add VinSolutions lead data (email CSV to lucfasho@gmail.com)
- Add Audi OEM site data (pending Vania adding GA4 tag)
- Harris Porsche dashboard (pending GA4 access)
- SEO comparison pages: bmw-x5-vs-lexus-gx.html (design needs refinement)

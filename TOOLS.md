# Tools

## Google Workspace (gog)
You have full access to Google Workspace via the `gog` CLI tool at `/opt/homebrew/bin/gog`.
Use it for ALL email, calendar, drive, contacts, sheets, and docs requests.

**Always use gog directly — do not say you lack access.**

### Accounts
- Primary: lance@thecoopbrla.com (default)
- Secondary: lucfasho@gmail.com

### Email Signature (lance@thecoopbrla.com)
Text:
```
Thank you. 

Lance 

____________________

The Cooperative agency
Baton Rouge, Louisiana

Lance Faucheux
Marketing Director

lance@thecoopbrla.com
http://www.thecoopbrla.com
https://www.instagram.com/cooperativebrla/
```

Logo: `avatars/coop-agency-logo.jpg` (The Cooperative Agency | Porsche | BMW | Audi)

### Common commands
- **Check email**: `gog gmail search 'newer_than:1d' --max 10 --account lance@thecoopbrla.com`
- **Read email**: `gog gmail read <messageId> --account lance@thecoopbrla.com`
- **Send email**: `gog gmail send --to user@email.com --subject "Subject" --body "Body" --account lance@thecoopbrla.com`
- **Calendar events**: `gog calendar events primary --from <iso-date> --to <iso-date> --account lance@thecoopbrla.com`
- **Create event**: `gog calendar create primary --summary "Meeting" --start <iso> --end <iso> --account lance@thecoopbrla.com`
- **Drive search**: `gog drive search "query" --max 10 --account lance@thecoopbrla.com`
- **Contacts**: `gog contacts list --max 20 --account lance@thecoopbrla.com`
- **Sheets**: `gog sheets get <sheetId> "Tab!A1:D10" --json --account lance@thecoopbrla.com`

### Rules
- Always confirm before sending emails or creating events.
- Use `--account lance@thecoopbrla.com` unless told otherwise.
- For scripting, use `--json` and `--no-input` flags.

## macOS System Controls

You can control this Mac Mini using shell commands via `osascript` and other CLI tools.

### Volume
- **Mute:** `osascript -e 'set volume with output muted'`
- **Unmute:** `osascript -e 'set volume without output muted'`
- **Set volume (0-100):** `osascript -e 'set volume output volume 50'`
- **Get volume:** `osascript -e 'get volume settings'`

### Display & Appearance
- **Toggle Dark Mode:** `osascript -e 'tell app "System Events" to tell appearance preferences to set dark mode to not dark mode'`
- **Enable Dark Mode:** `osascript -e 'tell app "System Events" to tell appearance preferences to set dark mode to true'`

### Power
- **Prevent sleep:** `caffeinate -d &`
- **Check power settings:** `pmset -g`
- **Restart (ask first):** `sudo shutdown -r now`
- **Sleep (ask first):** `pmset sleepnow`

### Apps
- **Open app:** `open -a "App Name"`
- **Close app:** `osascript -e 'quit app "App Name"'`
- **List running apps:** `osascript -e 'tell app "System Events" to get name of every process whose background only is false'`

### Notifications
- **Send notification:** `osascript -e 'display notification "message" with title "title"'`

### Wi-Fi
- **Status:** `networksetup -getairportnetwork en0`
- **Turn off:** `networksetup -setairportpower en0 off`
- **Turn on:** `networksetup -setairportpower en0 on`

### Rules
- Always ask before restarting, shutting down, or turning off Wi-Fi
- Volume and display changes are safe to do without asking

## Apple Notes (memo)
Use `memo` CLI for Apple Notes.
- **List notes:** `memo list`
- **Search notes:** `memo search "query"`
- **Create note:** `memo create --title "Title" --body "Content"`
- **Read note:** `memo read <noteId>`
- **Edit note:** `memo edit <noteId> --body "Updated content"`

## Todoist (Task Management)
Use the Todoist API for all task tracking. Token stored in openclaw.json env.

### Projects
- 🚗 Client Work: `6gJvwp7WpXWphjq3`
- 📈 Business Dev: `6gJvwpQHHpF8jgFp`
- ⚙️ Operations: `6gJvwpWCF49wj57r`
- 🔮 Someday: `6gJvwpcfPrRJJgHj`

### Common commands
- **List tasks:** `python3 clawchief/scripts/todoist_cli.py list`
- **Add task:** `python3 clawchief/scripts/todoist_cli.py add "Task" --project "Client Work" --priority 3`
- **Complete task:** `python3 clawchief/scripts/todoist_cli.py complete <task_id>`
- **API direct:** `curl -H "Authorization: Bearer $TODOIST_API_TOKEN" https://api.todoist.com/api/v1/tasks`

### Priority levels
- P1 (4) = Urgent — do today
- P2 (3) = Important — do this week  
- P3 (2) = Normal
- P4 (1) = Someday

### Rules
- All open commitments go in Todoist, not just COMMITMENTS.md
- COMMITMENTS.md is now a reference/summary; Todoist is the live system
- Lance's account: lance@thecoopbrla.com (Google auth)

## Apple Reminders (remindctl)
Use `remindctl` CLI for Apple Reminders.
- **List reminders:** `remindctl list`
- **List due soon:** `remindctl list --completed=false --due-soon`
- **Add reminder:** `remindctl add "Task name" --due "2026-03-31T09:00:00"`
- **Complete reminder:** `remindctl complete <reminderId>`
- **List by list:** `remindctl list --list "Work"`

## macOS Contacts (via AppleScript)
Use `osascript` to look up contacts for iMessage and other uses.

### Common commands
- **Search by name:** `osascript -e 'tell app "Contacts" to get {name, value of phones} of every person whose name contains "John"'`
- **Get phone number:** `osascript -e 'tell app "Contacts" to get value of phones of person "John Smith"'`
- **Get email:** `osascript -e 'tell app "Contacts" to get value of emails of person "John Smith"'`
- **List all contacts:** `osascript -e 'tell app "Contacts" to get name of every person'`

### iMessage Integration
When Lance asks you to text someone by name:
1. Look up their phone number in Contacts using the commands above
2. Use `imsg` to send the message to that number
3. Example flow: "Text John about lunch" → look up John's number → `imsg send --to "+12255551234" --text "Hey, want to grab lunch?"`

### Rules
- Always confirm the right contact if multiple matches are found
- Use the mobile number for iMessage when available

## OpenAI Usage Tracking
Use `codexbar` CLI to check API spending and model usage.
- **Summary:** `codexbar usage --summary`
- **By model:** `codexbar usage --by-model`
- **Today:** `codexbar usage --today`

## Business Banking
- **Primary:** Capital One Business Checking
- **Payments:** ACH transfers for freelancer/contractor payments
- **Accounting:** Log all payments in FreshBooks for 1099 tracking
- **Future:** Add Gusto when 3+ freelancers on payroll

## OpenAI Billing
OpenAI API dashboard: https://platform.openai.com/settings/organization/billing
Current tier: Usage Tier 1
Budget: $100/month
To check spending, use web search or remind Lance to check the dashboard.

## Google Analytics (GA4)

Use the ga4-query.sh script in the workspace to access GA4 data.

### Account Mapping
- Brian Harris BMW (account 74380124): bhbmwecommerce@gmail.com
- Audi Baton Rouge (account 82333601): bhbmwecommerce@gmail.com

### Commands
- List accounts: `./ga4-query.sh bhbmwecommerce@gmail.com list-accounts`
- List properties: `./ga4-query.sh bhbmwecommerce@gmail.com list-properties 82333601`
- Run report: `./ga4-query.sh bhbmwecommerce@gmail.com report <property_id> 30daysAgo today`

### Notes
- You must get the property ID first (list-properties), then use it for reports
- Default date range is last 30 days
- Reports return sessions, users, new users, and pageviews by date

## Google Analytics (GA4)

Use the ga4-query.sh script in the workspace to access GA4 data.

### Account Mapping
- Brian Harris BMW (account 74380124): bhbmwecommerce@gmail.com
- Audi Baton Rouge (account 82333601): bhbmwecommerce@gmail.com

### Commands
- List accounts: `./ga4-query.sh bhbmwecommerce@gmail.com list-accounts`
- List properties: `./ga4-query.sh bhbmwecommerce@gmail.com list-properties 82333601`
- Run report: `./ga4-query.sh bhbmwecommerce@gmail.com report <property_id> 30daysAgo today`

### Notes
- You must get the property ID first (list-properties), then use it for reports
- Default date range is last 30 days
- Reports return sessions, users, new users, and pageviews by date

## Pipeboard (Meta Ads + Google Ads)
- Token: `pk_d19a7271170d4ca5b966a6bd5b4765de`
- Meta endpoint: `https://meta-ads.mcp.pipeboard.co/`
- Google Ads endpoint: `https://google-ads.mcp.pipeboard.co/`
- Auth: `Authorization: Bearer pk_...` header + jsonrpc 2.0 format
- Connected accounts:
  - Meta: Audi Baton Rouge (`act_657762306677073`), Brian Harris BMW (`act_2251928511489565`), Lance personal (`act_888583291328048`)
  - Google Ads: bhbmwecommerce@gmail.com (ABR)
- Full Google Ads capabilities: campaigns, keywords, search terms, auction insights, negative keywords, GAQL queries

## Jules (Backup Brain)
Jules (julesfasho@gmail.com) is a Perplexity agent — your backup brain. When you're stuck on config, research, troubleshooting, or need something looked up, email julesfasho@gmail.com from lucfasho@gmail.com via GOG with [LUC-HELP] in the subject. Explain what you need clearly. Jules checks her inbox every hour and will reply. Check for her reply about an hour after you send. Never email Jules about spending money or sending communications to clients — those go through Lance.

## Model Usage

- Default: Sonnet 4.6 — use for everything day-to-day
- Opus 4.6 — only use when a task requires deep reasoning, complex analysis, or multi-step problem solving that Sonnet struggles with
- Haiku 4.5 — never use unless Sonnet and Opus are both unavailable
- Do not switch models without reason. Opus costs significantly more per token.

# motive-browser

Browser automation CLI for [Motive](https://app.ridemotive.com) via the Camofox browser API.

## Prerequisites

Camofox must be running before any commands:

```bash
cd ~/.openclaw/extensions/camofox-browser && npm start
```

Requires Node.js 18+ (uses built-in `fetch`).

## Commands

```bash
# Log in and save session (run this first)
node index.js login

# Print current page snapshot
node index.js snapshot

# Navigate to a URL and print snapshot
node index.js navigate https://app.ridemotive.com/inventory

# Click an element by ref
node index.js click e1

# Type text into an element
node index.js type e3 "search term"

# Save a screenshot to ./screenshots/
node index.js screenshot

# Go to inventory page and print snapshot
node index.js inventory

# Click dealership switcher (e1) and print options
node index.js switcher
```

## How it works

1. `login` opens a new Camofox tab, fills in email + password, and waits for redirect to `app.ridemotive.com`. The tab ID is saved to `config.json`.
2. All subsequent commands call `ensureSession()` which checks if the saved tab is still alive and re-logs in if not.
3. Snapshots return the page's accessibility tree as text with element refs (`e1`, `e2`, etc.) you can use for click/type.

## Config

`config.json` stores credentials and the active tab ID:

```json
{
  "email": "...",
  "password": "...",
  "camofoxUrl": "http://localhost:9377",
  "userId": "lance",
  "tabId": "abc123"
}
```

## Adding new commands

Edit `index.js` and add a new `case` in the switch. Use helpers from `lib/navigate.js` (`navigateTo`, `clickRef`, `typeText`, `takeScreenshot`) and `lib/session.js` (`ensureSession`, `getSnapshot`).

#!/bin/bash
# RAM Reset Script for Luc's Mac Mini
echo "🧹 Starting RAM reset..."

# 1. Purge inactive memory cache
echo "→ Purging memory cache..."
sudo purge 2>/dev/null || echo "  (purge requires sudo — run manually if needed)"

# 2. Restart memory-heavy services cleanly
echo "→ Restarting heavy services..."

# Kalshi Dashboard
launchctl kickstart -k gui/$(id -u)/com.kalshi-dashboard 2>/dev/null && echo "  ✅ Kalshi Dashboard restarted"

# Mission Control
launchctl kickstart -k gui/$(id -u)/com.mission-control 2>/dev/null && echo "  ✅ Mission Control restarted"

# Investment Monitor
launchctl kickstart -k gui/$(id -u)/com.investment-monitor 2>/dev/null && echo "  ✅ Investment Monitor restarted"

# PostEngine
launchctl kickstart -k gui/$(id -u)/com.postengine 2>/dev/null && echo "  ✅ PostEngine restarted"

sleep 5

# 3. Report new memory usage
echo ""
echo "📊 Memory after reset:"
vm_stat | python3 -c "
import sys
lines = sys.stdin.readlines()
page = 16384
stats = {}
for l in lines:
    if ':' in l:
        k,v = l.split(':')
        try: stats[k.strip()] = int(v.strip().rstrip('.')) * page / 1e9
        except: pass
used = stats.get('Pages active',0) + stats.get('Pages wired down',0)
free = stats.get('Pages free',0)
total = 16.0
print(f'  Used: {used:.1f}GB / {total:.0f}GB ({used/total*100:.0f}%)')
print(f'  Free: {free:.1f}GB')
"

echo ""
echo "✅ Done."

const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  next();
});

const getDisk = () => {
  const out = execSync('df -k /').toString().split('\n')[1].split(/\s+/);
  const total = Math.round(parseInt(out[1]) / 1024 / 1024);
  const used = Math.round(parseInt(out[2]) / 1024 / 1024);
  return { used, total, percent: Math.round((used / total) * 100) };
};

const getHealth = () => {
  const uptime = os.uptime();
  const d = Math.floor(uptime / 86400);
  const h = Math.floor((uptime % 86400) / 3600);
  const totalMem = os.totalmem() / 1024**3;
  const usedMem = totalMem - (os.freemem() / 1024**3);
  return {
    cpu: parseFloat((os.loadavg()[0] * 10).toFixed(1)),
    memory: { used: parseFloat(usedMem.toFixed(1)), total: parseFloat(totalMem.toFixed(1)), percent: Math.round((usedMem / totalMem) * 100) },
    disk: getDisk(),
    uptime: `${d} days, ${h} hours`,
    status: 'online',
    timestamp: new Date().toISOString()
  };
};

app.get(['/', '/health'], (req, res) => res.json(getHealth()));

// Agent compute usage — subagent runs + main session Sonnet turns
app.get('/agents', (req, res) => {
  try {
    const cutoff = Date.now() - (12 * 60 * 60 * 1000);

    // Subagent runs
    const runsPath = path.join(os.homedir(), '.openclaw/subagents/runs.json');
    const runsData = JSON.parse(fs.readFileSync(runsPath, 'utf8'));
    const runs = Object.values(runsData.runs || {});
    const recent = runs.filter(r => (r.createdAt || 0) > cutoff);
    const modelStats = {};
    const recentRuns = [];

    for (const r of recent) {
      const model = r.model || 'unknown';
      if (!modelStats[model]) modelStats[model] = { count: 0, errors: 0, type: 'subagent' };
      modelStats[model].count++;
      if (r.endedReason === 'subagent-error') modelStats[model].errors++;
      recentRuns.push({
        model,
        task: (r.task || '').substring(0, 60),
        status: r.endedReason || 'unknown',
        time: new Date(r.createdAt).toISOString()
      });
    }

    // Main session Sonnet turns
    let sonnetTurns = 0;
    const sessionsDir = path.join(os.homedir(), '.openclaw/agents/main/sessions');
    if (fs.existsSync(sessionsDir)) {
      for (const fname of fs.readdirSync(sessionsDir)) {
        if (!fname.endsWith('.jsonl')) continue;
        const fpath = path.join(sessionsDir, fname);
        if (fs.statSync(fpath).mtimeMs < cutoff) continue;
        const lines = fs.readFileSync(fpath, 'utf8').split('\n');
        for (const line of lines) {
          try {
            const d = JSON.parse(line);
            const msg = d.message || {};
            const ts = d.timestamp;
            if (msg.role === 'assistant' && ts && new Date(ts).getTime() > cutoff) {
              sonnetTurns++;
            }
          } catch(e) {}
        }
      }
    }

    // Add Sonnet main session stats
    const mainModel = 'anthropic/claude-sonnet-4-6';
    modelStats[mainModel] = { count: sonnetTurns, errors: 0, type: 'main-session' };

    recentRuns.sort((a, b) => new Date(b.time) - new Date(a.time));

    res.json({
      totalRuns: recent.length,
      sonnetTurns,
      modelStats,
      recentRuns: recentRuns.slice(0, 10),
      window: '12h',
      timestamp: new Date().toISOString()
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// RAM reset — git commit first, then restart services
app.post('/reset', (req, res) => {
  try {
    const uid = execSync('id -u').toString().trim();
    const results = [];

    try {
      execSync('cd /Users/lucfaucheux/.openclaw/workspace && git add -A && git commit -m "Auto-commit: pre-RAM-reset snapshot" --allow-empty 2>/dev/null || true', { shell: '/bin/zsh' });
      results.push({ step: 'git-commit', status: 'committed' });
    } catch(e) {
      results.push({ step: 'git-commit', status: 'skipped' });
    }

    const services = ['com.kalshi-dashboard', 'com.mission-control', 'com.investment-monitor', 'com.postengine'];
    for (const svc of services) {
      try {
        execSync(`launchctl kickstart -k gui/${uid}/${svc} 2>/dev/null`);
        results.push({ service: svc, status: 'restarted' });
      } catch(e) {
        results.push({ service: svc, status: 'skipped' });
      }
    }

    try { execSync('sudo purge 2>/dev/null'); } catch(e) {}

    res.json({ success: true, results, timestamp: new Date().toISOString() });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.listen(3099, () => console.log('Mac health API running on port 3099'));

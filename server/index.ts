import express, { type Request, Response, NextFunction } from "express";
import fs from "fs";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startPublishPoller } from "./zernio-publisher";
import { requireBasicAuth } from "./auth";
import { generatedMediaDir } from "./media-store";
import { optionalEnvUnset, productionEnvProblems } from "./required-env";
import { handleAdminImport } from "./admin-import";
import { publishEnabled } from "./publish-switch";
// Load .env manually
import { readFileSync } from "fs";
try {
  const envFile = readFileSync(new URL('../.env', import.meta.url), 'utf-8');
  for (const line of envFile.split('\n')) {
    const [key, ...vals] = line.split('=');
    if (key && vals.length && !process.env[key.trim()]) {
      process.env[key.trim()] = vals.join('=').trim();
    }
  }
} catch {}

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Before the body parsers so a multi-gigabyte tar.gz is not buffered.
app.post("/api/admin/import", (req, res) => {
  void handleAdminImport(req, res);
});

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "postengine" });
});

// Public so existing /media/generated URLs and Zernio fetches keep working.
// No directory listing. Filenames are the files copied from the Mini.
app.use("/media/generated", (req, res, next) => {
  const dir = generatedMediaDir();
  fs.mkdirSync(dir, { recursive: true });
  express.static(dir, { index: false, dotfiles: "deny", fallthrough: false })(req, res, next);
});

app.use(requireBasicAuth);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const problems = productionEnvProblems();
  if (problems.length) {
    console.error(`Refusing to start. Missing or invalid production settings: ${problems.join(", ")}`);
    process.exit(1);
  }
  const optional = optionalEnvUnset();
  if (optional.length) {
    console.error(`Optional settings not set: ${optional.join(", ")}`);
  }
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim() || !process.env.TELEGRAM_CHAT_ID?.trim()) {
    console.error("Telegram notifications are off");
  }
  if (!publishEnabled()) {
    console.error("Publishing is off (PUBLISH_ENABLED is not true). The 60s publish loop and weekly scan will not run.");
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  async function registerTelegramWebhookIfEnabled() {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
    const url = process.env.TELEGRAM_WEBHOOK_URL?.trim() || "";
    if (process.env.TELEGRAM_SET_WEBHOOK !== "1" || !token || !url || !process.env.TELEGRAM_CHAT_ID?.trim()) return;
    const body: Record<string, string> = { url };
    if (process.env.TELEGRAM_WEBHOOK_SECRET) {
      body.secret_token = process.env.TELEGRAM_WEBHOOK_SECRET;
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok?: boolean; description?: string };
      if (data.ok) log("webhook registered", "telegram");
      else log(`webhook registration failed: ${data.description || res.status}`, "telegram");
    } catch (err) {
      log(`webhook registration error: ${err instanceof Error ? err.message : "unknown"}`, "telegram");
    }
  }

  httpServer.listen(
    {
      port,
      host: "0.0.0.0", // Listen on all interfaces including Tailscale
    },
    () => {
      log(`serving on port ${port}`);
      startPublishPoller(); // Start Zernio publish poller
      void registerTelegramWebhookIfEnabled();
    },
  );
})();

import { scanDriveFolders } from "./drive-scanner";
import { storage } from "./storage";

async function main() {
  const rawJobId = process.argv[2];
  const rawWeeks = process.argv[3];
  const jobId = Number(rawJobId);
  const weeks = Math.min(8, Math.max(1, Number.isFinite(Number(rawWeeks)) ? Math.trunc(Number(rawWeeks)) : 1));

  if (!Number.isInteger(jobId) || jobId <= 0) {
    throw new Error(`Invalid drive scan job id: ${rawJobId ?? "<missing>"}`);
  }

  console.log(`[DriveScanRunner] Starting drive scan job ${jobId} for ${weeks} week(s)`);

  try {
    const count = await scanDriveFolders(weeks);
    const completedAt = new Date().toISOString();

    storage.setAppSetting("last_scan_at", completedAt);
    storage.setAppSetting("last_scan_count", String(count));
    storage.updateEngineSourceByKey("post-engine-drive-ingestion", {
      lastCheckedAt: completedAt,
      lastResultSummary: `Last manual scan created ${count} queued post(s)`,
      metadata: JSON.stringify({ route: "/api/drive/scan", source: "manual-route", newPosts: count }),
    });
    storage.updateEngineJob(jobId, {
      status: "completed",
      completedAt,
      summary: `Drive scan created ${count} queued post(s)`,
      payload: JSON.stringify({ source: "manual-route", newPosts: count }),
      errorMessage: null,
    });

    console.log(`[DriveScanRunner] Completed drive scan job ${jobId} with ${count} queued post(s) for ${weeks} week(s)`);
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    storage.updateEngineJob(jobId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      summary: "Drive scan failed",
      errorMessage: message,
    });
    console.error(`[DriveScanRunner] Drive scan job ${jobId} failed:`, error);
    process.exitCode = 1;
  }
}

void main();

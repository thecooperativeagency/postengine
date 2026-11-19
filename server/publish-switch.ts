/** Publishing stays off unless this is exactly the string true. */
export function publishEnabled(): boolean {
  return process.env.PUBLISH_ENABLED === "true";
}

/** Drive ingest stays off unless this is exactly the string true. Independent of publishing. */
export function driveScanEnabled(): boolean {
  return process.env.DRIVE_SCAN_ENABLED === "true";
}

/**
 * TikTok sends stay off unless this is exactly the string true.
 * Independent of PUBLISH_ENABLED. A mapped account id is not enough.
 */
export function tiktokPublishEnabled(): boolean {
  return process.env.TIKTOK_PUBLISH_ENABLED === "true";
}

/** The automatic 60s poller starts only when publishing is globally on. */
export function shouldStartPublishPoller(): boolean {
  return publishEnabled();
}

/**
 * Manual publish of one already-approved post may run when the global flag is off.
 * The poller never uses this path.
 */
export function canStartPublish(options: { manual?: boolean } = {}): boolean {
  return publishEnabled() || options.manual === true;
}

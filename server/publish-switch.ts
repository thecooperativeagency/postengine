/** Publishing stays off unless this is exactly the string true. */
export function publishEnabled(): boolean {
  return process.env.PUBLISH_ENABLED === "true";
}

/** Drive ingest stays off unless this is exactly the string true. Independent of publishing. */
export function driveScanEnabled(): boolean {
  return process.env.DRIVE_SCAN_ENABLED === "true";
}

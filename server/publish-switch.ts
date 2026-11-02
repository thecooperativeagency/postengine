/** Publishing stays off unless this is exactly the string true. */
export function publishEnabled(): boolean {
  return process.env.PUBLISH_ENABLED === "true";
}

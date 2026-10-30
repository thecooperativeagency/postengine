import fs from "fs";

/**
 * Resolve a CLI binary at call time.
 * Prefer an explicit env override, then the Mac Mini Homebrew path when that
 * file exists, then the bare command on PATH (the Railway image).
 */
export function resolveBin(envName: string, macHomebrewPath: string, command: string): string {
  const fromEnv = process.env[envName];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  if (fs.existsSync(macHomebrewPath)) return macHomebrewPath;
  return command;
}

export function googleWorkspaceAccount(): string {
  return process.env.GOOGLE_WORKSPACE_ACCOUNT?.trim() || "lance@thecoopbrla.com";
}

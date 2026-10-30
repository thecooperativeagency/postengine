export function cleanText(value?: string | null): string {
  return (value || "").trim();
}

export function stripHashtagLines(text?: string | null): string {
  if (!text) return "";
  return text
    .split(/\n+/)
    .filter((part) => !part.trim().startsWith("#"))
    .join("\n\n")
    .trim();
}

export function sanitizeLegacyCaption(text?: string | null, ctas: Array<string | null | undefined> = []): string {
  if (!text) return "";

  const loweredCtas = ctas
    .map((value) => cleanText(value).toLowerCase())
    .filter(Boolean);

  const lines = String(text)
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .filter((line) => line !== "---")
    .filter((line) => !/^\*\*twitter/i.test(line))
    .filter((line) => !loweredCtas.includes(line.toLowerCase()));

  return lines.join("\n\n").trim();
}

export function joinParts(...parts: Array<string | null | undefined>): string {
  return parts.map((part) => cleanText(part)).filter(Boolean).join("\n\n");
}

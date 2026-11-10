export function parseAllowedEmails(raw: string | undefined): Set<string> {
  return new Set(
    String(raw || "")
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = parseAllowedEmails(process.env.ALLOWED_EMAILS);
  if (allowed.size === 0) return false;
  return allowed.has(email.toLowerCase());
}

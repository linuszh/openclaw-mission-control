export function getApiBaseUrl(): string {
  let raw = process.env.NEXT_PUBLIC_API_URL ?? "";
  if (typeof window === "undefined" && !raw) {
    raw = "http://127.0.0.1:8000";
  }
  const normalized = raw.replace(/\/+$/, "");
  return normalized;
}

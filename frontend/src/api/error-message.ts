/** Render service errors and validation details without coercing objects to text. */
export function errorMessage(value: unknown, fallback = "Could not analyze that video. Please retry."): string {
  function text(item: unknown, depth = 0): string {
    if (depth > 5 || item == null) return "";
    if (typeof item === "string") return item.trim() === "[object Object]" ? "" : item.trim();
    if (Array.isArray(item)) return item.map(v => text(v, depth + 1)).filter(Boolean).join(" ");
    if (typeof item !== "object") return "";
    const object = item as Record<string, unknown>;
    const service = text((object.response as { data?: unknown } | undefined)?.data, depth + 1);
    if (service) return service;
    for (const key of ["detail", "error", "message", "msg"]) {
      const message = text(object[key], depth + 1);
      if (message) return message;
    }
    return "";
  }
  return text(value) || fallback;
}

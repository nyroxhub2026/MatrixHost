
export function truncate(
  value: string,
  maxLength: number,
  suffix = "..."
): string {
  if (maxLength < 0) {
    throw new Error("maxLength cannot be negative");
  }

  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= suffix.length) {
    return suffix.slice(0, maxLength);
  }

  return value.slice(0, maxLength - suffix.length) + suffix;
}

export function capitalize(value: string): string {
  if (!value) return "";

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character] ?? character;
  });
}

/**
 * YouTube thumbnail URL helpers (no API key needed — these are deterministic).
 */

export function getYouTubeThumbnail(
  videoKey: string,
  quality: "maxresdefault" | "hqdefault" | "mqdefault" | "default" = "hqdefault",
): string {
  return `https://img.youtube.com/vi/${videoKey}/${quality}.jpg`;
}

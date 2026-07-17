// Tiny relative-time formatter to avoid adding date-fns.
export function formatDistanceToNow(d: Date): string {
  const diff = Math.max(1, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString();
}

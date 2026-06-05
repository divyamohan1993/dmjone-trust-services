/**
 * HTML/attribute escaping for server-side rendering. All record-derived text is
 * authored by the issuer (already length/shape-validated upstream), but we
 * escape on output regardless — defence in depth, never trust, encode at the
 * boundary. There is zero raw HTML injection on any public surface.
 */

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape text for placement in element content or a double/single-quoted attribute. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch] ?? ch);
}

/**
 * A078: where a printed book's QR key leads inside the app. Only known reference types map to a page; an
 * unknown type or a missing reference never guesses a destination.
 */
export type PhysicalLink = { reference_type: string; reference_id: string | null; payload?: any };
export function physicalLinkTarget(link: PhysicalLink): { kind: 'route' | 'external' | 'none'; to: string | null } {
  const id = link.reference_id ? encodeURIComponent(link.reference_id) : null;
  switch (link.reference_type) {
    case 'WORKSHEET': return id ? { kind: 'route', to: `/worksheets?open=${id}` } : { kind: 'none', to: null };
    case 'ASSIGNMENT': return id ? { kind: 'route', to: `/assignments?open=${id}` } : { kind: 'none', to: null };
    case 'TEST': case 'QUESTION_SET': return id ? { kind: 'route', to: `/board/${id}` } : { kind: 'none', to: null };
    case 'VIDEO': { const url = String(link.payload?.url || ''); return /^https:\/\//.test(url) ? { kind: 'external', to: url } : { kind: 'none', to: null }; }
    default: return { kind: 'none', to: null };
  }
}
/** YouTube watch/short links become an embeddable address; other https videos are opened as they are. */
export function embeddableVideo(url: string | null | undefined): string | null {
  if (!url || !/^https:\/\//.test(url)) return null;
  const m = url.match(/^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}

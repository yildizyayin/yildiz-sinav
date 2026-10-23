/**
 * A067: the one rule for a video a learner may open — approved by a person, published (not draft or a future
 * scheduled time), and not marked broken by the link check. Unreviewed automatic candidates are never served.
 */
export const SERVABLE_VIDEO_SQL = `vl.approved=1 AND (vl.status='PUBLISHED' OR vl.status IS NULL) AND (vl.publish_at IS NULL OR datetime(vl.publish_at)<=CURRENT_TIMESTAMP) AND COALESCE(vl.link_status,'UNKNOWN')<>'BROKEN'`;

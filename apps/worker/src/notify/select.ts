import { RULE_COOLDOWN_MS, eventMatchesRule, type NearbyHazardEvent, type NotificationRule } from '@allclear/shared';

export interface PriorNotification {
  hazard_event_id: string | null;
  sent_at: string;
  event_type: string | null;
}

export interface Candidate {
  event: NearbyHazardEvent;
  /** When true, this is a roll-up of several hotspots; `event` is the nearest one. */
  hotspotCount?: number;
}

const HOTSPOT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const QUAKE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * Pure selection of what to notify for one rule this run. Enforces:
 *  - per-event de-duplication against notifications_log
 *  - cooldowns (AQI: 6h; hotspot roll-ups: 6h) so a big fire doesn't produce hundreds of pushes
 *  - "newness" windows so creating a rule doesn't replay a week of quakes
 */
export function selectCandidates(
  rule: NotificationRule,
  events: NearbyHazardEvent[],
  prior: PriorNotification[],
  radiusMiles: number | null,
  now: Date,
): Candidate[] {
  const notified = new Set(prior.map((p) => p.hazard_event_id).filter((id): id is string => Boolean(id)));
  const lastSentAt = prior.reduce<number>((acc, p) => Math.max(acc, Date.parse(p.sent_at) || 0), 0);
  const matching = events.filter((e) =>
    eventMatchesRule(rule, e, { distanceMiles: e.distance_miles, radiusMiles }),
  );

  switch (rule.condition_type) {
    case 'aqi_threshold': {
      const reading = matching[0];
      if (!reading) return [];
      if (now.getTime() - lastSentAt < RULE_COOLDOWN_MS.aqi_threshold) return [];
      return [{ event: reading }];
    }
    case 'magnitude_threshold':
      return matching
        .filter((e) => !notified.has(e.id))
        .filter((e) => e.occurred_at !== null && now.getTime() - Date.parse(e.occurred_at) <= QUAKE_LOOKBACK_MS)
        .map((event) => ({ event }));
    case 'any_active':
      return matching.filter((e) => !notified.has(e.id)).map((event) => ({ event }));
    case 'distance_threshold_miles': {
      const incidents = matching.filter((e) => e.event_type === 'fire_incident' && !notified.has(e.id)).map((event) => ({ event }));
      const lastHotspotAt = prior
        .filter((p) => p.event_type === 'fire_hotspot')
        .reduce<number>((acc, p) => Math.max(acc, Date.parse(p.sent_at) || 0), 0);
      const cutoff = lastHotspotAt > 0 ? lastHotspotAt : now.getTime() - 24 * 60 * 60 * 1000;
      const fresh = matching.filter(
        (e) => e.event_type === 'fire_hotspot' && e.occurred_at !== null && Date.parse(e.occurred_at) > cutoff,
      );
      if (fresh.length === 0 || now.getTime() - lastHotspotAt < HOTSPOT_COOLDOWN_MS) return incidents;
      const nearest = fresh.reduce((a, b) => (b.distance_miles < a.distance_miles ? b : a));
      return [...incidents, { event: nearest, hotspotCount: fresh.length }];
    }
    default:
      return [];
  }
}

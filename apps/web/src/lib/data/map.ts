import 'server-only';
import { ApiError, type BBox, type MapFireDTO, type MapQuakeDTO, type MapResponse } from '@allclear/shared';
import type { ServerSupabaseClient } from '@/lib/supabase/server';

type BboxRow = {
  id: string;
  source: 'nws' | 'firms' | 'inciweb' | 'usgs' | 'airnow';
  event_type: string;
  title: string;
  severity: string | null;
  latitude: number;
  longitude: number;
  magnitude: number | null;
  occurred_at: string | null;
  attributes: unknown;
  fetched_at: string;
};

const MAX_MARKERS = 2500;

export async function getMapData(
  supabase: ServerSupabaseClient,
  bbox: BBox,
  layers: { fires: boolean; quakes: boolean },
): Promise<MapResponse> {
  const types: string[] = [];
  if (layers.fires) types.push('fire_hotspot', 'fire_incident');
  if (layers.quakes) types.push('earthquake');

  const rows: BboxRow[] = types.length
    ? await (async () => {
        const { data, error } = await supabase.rpc('hazards_in_bbox', {
          p_min_lng: bbox.minLng,
          p_min_lat: bbox.minLat,
          p_max_lng: bbox.maxLng,
          p_max_lat: bbox.maxLat,
          p_event_types: types,
          p_limit: MAX_MARKERS,
        });
        if (error) {
          console.error('[map] hazards_in_bbox failed', error.message);
          throw new ApiError('INTERNAL_ERROR', 'Could not load map data');
        }
        return (data ?? []) as BboxRow[];
      })()
    : [];

  const fires: MapFireDTO[] = [];
  const quakes: MapQuakeDTO[] = [];
  let firesUpdated: string | null = null;
  let quakesUpdated: string | null = null;

  for (const row of rows) {
    const a = (row.attributes && typeof row.attributes === 'object' ? row.attributes : {}) as Record<string, unknown>;
    if (row.event_type === 'earthquake') {
      quakes.push({
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        magnitude: Number(row.magnitude ?? 0),
        place: typeof a.place === 'string' ? a.place : row.title,
        occurred_at: row.occurred_at ?? row.fetched_at,
        source: row.source,
      });
      if (!quakesUpdated || row.fetched_at > quakesUpdated) quakesUpdated = row.fetched_at;
    } else {
      const isIncident = row.event_type === 'fire_incident';
      fires.push({
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        detected_at: row.occurred_at,
        source: row.source,
        kind: isIncident ? 'incident' : 'hotspot',
        ...(isIncident
          ? {
              name: row.title,
              containment_pct: typeof a.containment_pct === 'number' ? a.containment_pct : null,
              acres: typeof a.acres === 'number' ? a.acres : null,
            }
          : {}),
      });
      if (!firesUpdated || row.fetched_at > firesUpdated) firesUpdated = row.fetched_at;
    }
  }

  return { data: { fires, quakes }, meta: { fires_updated_at: firesUpdated, quakes_updated_at: quakesUpdated } };
}

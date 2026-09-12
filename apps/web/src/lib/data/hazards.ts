import 'server-only';
import {
  ApiError,
  DEFAULT_MIN_MAGNITUDE,
  DEFAULT_RADIUS_MILES,
  aqiCategory,
  isStale,
  type AirQualityDTO,
  type EarthquakeDTO,
  type HotspotDTO,
  type IncidentDTO,
  type LayerConfigDTO,
  type LocationHazardsResponse,
  type OfficialAlertDTO,
  type WatchLocation,
  type WeatherDTO,
} from '@allclear/shared';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import { layerMap } from './layers';

type HazardRow = {
  id: string;
  source: 'nws' | 'firms' | 'inciweb' | 'usgs' | 'airnow';
  external_id: string;
  event_type: string;
  title: string;
  description: string | null;
  severity: string | null;
  latitude: number | null;
  longitude: number | null;
  magnitude: number | null;
  aqi: number | null;
  occurred_at: string | null;
  attributes: unknown;
  fetched_at: string;
  expires_at: string | null;
  distance_miles: number;
};

function attrs(row: HazardRow): Record<string, unknown> {
  return row.attributes && typeof row.attributes === 'object' ? (row.attributes as Record<string, unknown>) : {};
}
function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function rpcRows<T>(promise: PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
  const { data, error } = await promise;
  if (error) {
    console.error(`[hazards] ${what} failed`, error.message);
    throw new ApiError('INTERNAL_ERROR', `Could not load ${what}`);
  }
  return data ?? [];
}

export function toAlertDTO(row: HazardRow): OfficialAlertDTO {
  const a = attrs(row);
  return {
    id: row.id,
    event: row.title,
    headline: str(a.headline),
    severity: row.severity ?? 'Unknown',
    urgency: str(a.urgency),
    description: row.description,
    instruction: str(a.instruction),
    onset_at: row.occurred_at,
    expires_at: row.expires_at,
    sender: str(a.sender),
    source: row.source,
  };
}

function toHotspotDTO(row: HazardRow): HotspotDTO {
  const a = attrs(row);
  return {
    id: row.id,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    distance_miles: row.distance_miles,
    detected_at: row.occurred_at,
    confidence: str(a.confidence),
    satellite: str(a.satellite),
    source: row.source,
  };
}

function toIncidentDTO(row: HazardRow): IncidentDTO {
  const a = attrs(row);
  return {
    id: row.id,
    name: row.title,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    distance_miles: row.distance_miles,
    containment_pct: num(a.containment_pct),
    acres: num(a.acres),
    status: str(a.status),
    updated_at: str(a.updated_at) ?? row.fetched_at,
    url: str(a.url),
    source: row.source,
  };
}

function toQuakeDTO(row: HazardRow): EarthquakeDTO {
  const a = attrs(row);
  return {
    id: row.id,
    magnitude: Number(row.magnitude ?? 0),
    place: str(a.place) ?? row.title,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    distance_miles: row.distance_miles,
    occurred_at: row.occurred_at ?? row.fetched_at,
    url: str(a.url),
    source: row.source,
  };
}

function toAqiDTO(row: HazardRow): AirQualityDTO {
  const a = attrs(row);
  const aqi = row.aqi ?? 0;
  return {
    aqi,
    category: str(a.category) ?? aqiCategory(aqi).name,
    pollutant: str(a.pollutant),
    reporting_area: str(a.reporting_area),
    distance_miles: row.distance_miles,
    observed_at: row.occurred_at,
    source: row.source,
    fetched_at: row.fetched_at,
    stale: isStale(row.source, row.fetched_at),
  };
}

interface LayerContext {
  lat: number;
  lng: number;
  wildfireRadius: number;
  quakeRadius: number;
  minMagnitude: number;
}

export function layerContext(location: WatchLocation, layers: LayerConfigDTO[]): LayerContext & { cfg: ReturnType<typeof layerMap> } {
  const cfg = layerMap(layers);
  return {
    cfg,
    lat: Number(location.latitude),
    lng: Number(location.longitude),
    wildfireRadius: cfg.wildfire.radius_miles ?? DEFAULT_RADIUS_MILES.wildfire ?? 25,
    quakeRadius: cfg.earthquake.radius_miles ?? DEFAULT_RADIUS_MILES.earthquake ?? 100,
    minMagnitude: cfg.earthquake.min_magnitude ?? DEFAULT_MIN_MAGNITUDE,
  };
}

function newestFetchedAt(rows: HazardRow[]): string | null {
  return rows.reduce<string | null>((acc, r) => (!acc || r.fetched_at > acc ? r.fetched_at : acc), null);
}

export async function loadWeather(supabase: ServerSupabaseClient, ctx: LayerContext): Promise<WeatherDTO> {
  const { data, error } = await supabase.rpc('nearest_weather', { p_lat: ctx.lat, p_lng: ctx.lng, p_max_miles: 10 });
  if (error) {
    console.error('[hazards] weather failed', error.message);
    throw new ApiError('INTERNAL_ERROR', 'Could not load weather');
  }
  const row = Array.isArray(data) ? data[0] : undefined;
  if (!row) return { current: null, hourly: [], daily: [], source: 'nws', fetched_at: null, stale: true };
  return {
    current: row.current ? { ...row.current, source: row.source, fetched_at: row.fetched_at } : null,
    hourly: Array.isArray(row.hourly) ? row.hourly : [],
    daily: Array.isArray(row.daily) ? row.daily : [],
    source: row.source,
    fetched_at: row.fetched_at,
    stale: isStale(row.source, row.fetched_at),
  };
}

export async function loadWildfire(
  supabase: ServerSupabaseClient,
  ctx: LayerContext,
): Promise<NonNullable<LocationHazardsResponse['wildfire']>> {
  const fires = await rpcRows<HazardRow>(
    supabase.rpc('hazards_near', {
      p_lat: ctx.lat,
      p_lng: ctx.lng,
      p_radius_miles: ctx.wildfireRadius,
      p_event_types: ['fire_hotspot', 'fire_incident'],
      p_limit: 300,
    }),
    'wildfire data',
  );
  return {
    hotspots: fires.filter((r) => r.event_type === 'fire_hotspot').map(toHotspotDTO),
    incidents: fires.filter((r) => r.event_type === 'fire_incident').map(toIncidentDTO),
    radius_miles: ctx.wildfireRadius,
    stale: fires.length > 0 ? isStale('firms', newestFetchedAt(fires)) : false,
  };
}

export async function loadEarthquakes(
  supabase: ServerSupabaseClient,
  ctx: LayerContext,
): Promise<NonNullable<LocationHazardsResponse['earthquakes']>> {
  const quakes = await rpcRows<HazardRow>(
    supabase.rpc('hazards_near', {
      p_lat: ctx.lat,
      p_lng: ctx.lng,
      p_radius_miles: ctx.quakeRadius,
      p_event_types: ['earthquake'],
      p_limit: 200,
    }),
    'earthquake data',
  );
  const events = quakes
    .filter((r) => (r.magnitude ?? 0) >= ctx.minMagnitude)
    .map(toQuakeDTO)
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
  return {
    events,
    radius_miles: ctx.quakeRadius,
    min_magnitude: ctx.minMagnitude,
    stale: quakes.length > 0 ? isStale('usgs', newestFetchedAt(quakes)) : false,
  };
}

export async function loadAirQuality(supabase: ServerSupabaseClient, ctx: LayerContext): Promise<AirQualityDTO | null> {
  const rows = await rpcRows<HazardRow>(
    supabase.rpc('hazards_near', {
      p_lat: ctx.lat,
      p_lng: ctx.lng,
      p_radius_miles: 30,
      p_event_types: ['aqi_reading'],
      p_limit: 1,
    }),
    'air quality data',
  );
  const reading = rows[0];
  return reading ? toAqiDTO(reading) : null;
}

export async function loadAlerts(supabase: ServerSupabaseClient, ctx: LayerContext): Promise<OfficialAlertDTO[]> {
  const rows = await rpcRows<HazardRow>(supabase.rpc('alerts_for_point', { p_lat: ctx.lat, p_lng: ctx.lng }), 'official alerts');
  return rows.map(toAlertDTO);
}

/**
 * The core aggregation (API Design §5): reads exclusively from the caches — never an external API.
 * Bounded at 5 queries per location, run in parallel.
 */
export async function getLocationHazards(
  supabase: ServerSupabaseClient,
  location: WatchLocation,
  layers: LayerConfigDTO[],
): Promise<LocationHazardsResponse> {
  const ctx = layerContext(location, layers);
  const { cfg } = ctx;
  const [weather, wildfire, earthquakes, air_quality, official_alerts] = await Promise.all([
    cfg.weather.enabled ? loadWeather(supabase, ctx) : Promise.resolve(undefined),
    cfg.wildfire.enabled ? loadWildfire(supabase, ctx) : Promise.resolve(undefined),
    cfg.earthquake.enabled ? loadEarthquakes(supabase, ctx) : Promise.resolve(undefined),
    cfg.air_quality.enabled ? loadAirQuality(supabase, ctx) : Promise.resolve(undefined),
    loadAlerts(supabase, ctx),
  ]);
  const response: LocationHazardsResponse = { official_alerts };
  if (weather !== undefined) response.weather = weather;
  if (wildfire !== undefined) response.wildfire = wildfire;
  if (earthquakes !== undefined) response.earthquakes = earthquakes;
  if (air_quality !== undefined) response.air_quality = air_quality;
  return response;
}

export type { HazardRow };

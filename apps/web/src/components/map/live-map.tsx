'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Flame, Activity, Search } from 'lucide-react';
import { relativeTime, type GeocodeResult, type MapResponse } from '@allclear/shared';
import { apiFetch, errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HazardMap, type MapPin } from './hazard-map';

const US_CENTER: [number, number] = [39.5, -98.35];

interface LiveMapProps {
  /** Teaser mode: non-interactive, no controls, loads a fixed CONUS viewport. */
  teaser?: boolean;
  /** Logged-in users get "Add as Watch Location"; logged-out get "Sign up to save". */
  loggedIn?: boolean;
  className?: string;
}

type BBox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

/** The national public map (UI/UX Notes §3 "Map"): fires + quakes from /api/hazards/map. */
export function LiveMap({ teaser = false, loggedIn = false, className }: LiveMapProps) {
  const [layers, setLayers] = useState({ fires: true, quakes: true });
  const [data, setData] = useState<MapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [center, setCenter] = useState<[number, number]>(US_CENTER);
  const [zoom, setZoom] = useState(teaser ? 4 : 4);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<GeocodeResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const lastBbox = useRef<BBox | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (bbox: BBox) => {
      const layerParam = [layers.fires ? 'fires' : null, layers.quakes ? 'quakes' : null].filter(Boolean).join(',');
      if (!layerParam) {
        setData({ data: { fires: [], quakes: [] }, meta: { fires_updated_at: null, quakes_updated_at: null } });
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const bboxParam = `${bbox.minLng.toFixed(3)},${bbox.minLat.toFixed(3)},${bbox.maxLng.toFixed(3)},${bbox.maxLat.toFixed(3)}`;
        const result = await apiFetch<MapResponse>(`/api/hazards/map?bbox=${bboxParam}&layers=${layerParam}`);
        setData(result);
        setError(null);
      } catch (err) {
        setError(errorMessage(err, 'Live hazard data temporarily unavailable'));
      } finally {
        setLoading(false);
      }
    },
    [layers.fires, layers.quakes],
  );

  const handleMoveEnd = useCallback(
    (bbox: BBox) => {
      lastBbox.current = bbox;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void load(bbox), 300);
    },
    [load],
  );

  useEffect(() => {
    const bbox = teaser ? { minLng: -130, minLat: 20, maxLng: -60, maxLat: 55 } : lastBbox.current;
    if (!bbox) return;
    // Deferred so the fetch (and its loading state) starts after the render commits.
    const t = setTimeout(() => void load(bbox), 0);
    return () => clearTimeout(t);
  }, [load, teaser]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      const { data: results } = await apiFetch<{ data: GeocodeResult[] }>(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
      const first = results[0];
      if (!first) {
        setSearchError("Couldn't find that place. Try a city and state, e.g. “Bend, OR”.");
        setSearchResult(null);
        return;
      }
      setSearchResult(first);
      setCenter([first.latitude, first.longitude]);
      setZoom(9);
    } catch (err) {
      setSearchError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  }

  const pins: MapPin[] = searchResult
    ? [{ latitude: searchResult.latitude, longitude: searchResult.longitude, label: searchResult.display_name }]
    : [];

  const addHref = searchResult
    ? `/onboarding?lat=${searchResult.latitude}&lng=${searchResult.longitude}&label=${encodeURIComponent(searchResult.city_name ?? searchResult.display_name.split(',')[0] ?? 'New place')}&city=${encodeURIComponent(searchResult.city_name ?? '')}&state=${encodeURIComponent(searchResult.state ?? '')}`
    : '/onboarding';

  if (teaser) {
    return (
      <div className={cn('relative h-full w-full overflow-hidden rounded-card', className)} aria-hidden>
        <HazardMap center={US_CENTER} zoom={4} interactive={false} fires={data?.data.fires ?? []} quakes={data?.data.quakes ?? []} />
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col gap-3', className)}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <form onSubmit={search} className="flex w-full gap-2 md:max-w-md" role="search">
          <label htmlFor="map-search" className="sr-only">
            Search for a place
          </label>
          <Input
            id="map-search"
            placeholder="Search a city or address…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          <Button type="submit" disabled={searching} aria-label="Search">
            <Search className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{searching ? 'Searching…' : 'Search'}</span>
          </Button>
        </form>
        <div className="flex items-center gap-2" role="group" aria-label="Map layers">
          <button
            type="button"
            aria-pressed={layers.fires}
            onClick={() => setLayers((l) => ({ ...l, fires: !l.fires }))}
            className={cn(
              'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium',
              layers.fires ? 'border-orange-300 bg-orange-50 text-orange-900' : 'border-slate-300 bg-white text-slate-500',
            )}
          >
            <Flame className="h-4 w-4" aria-hidden /> Fires
          </button>
          <button
            type="button"
            aria-pressed={layers.quakes}
            onClick={() => setLayers((l) => ({ ...l, quakes: !l.quakes }))}
            className={cn(
              'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium',
              layers.quakes ? 'border-violet-300 bg-violet-50 text-violet-900' : 'border-slate-300 bg-white text-slate-500',
            )}
          >
            <Activity className="h-4 w-4" aria-hidden /> Quakes
          </button>
        </div>
      </div>

      {searchError ? (
        <p role="alert" className="text-sm text-alert-foreground">
          {searchError}
        </p>
      ) : null}

      {searchResult ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-primary/20 bg-primary-soft px-4 py-3 text-sm">
          <span className="text-slate-800">
            <span className="font-medium">{searchResult.display_name}</span>
          </span>
          <Button size="sm" asChild>
            <Link href={loggedIn ? addHref : `/signup?next=${encodeURIComponent(addHref)}`}>
              {loggedIn ? 'Add as Watch Location' : 'Sign up to save this location'}
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-card border border-slate-200">
        <HazardMap
          center={center}
          zoom={zoom}
          fires={layers.fires ? (data?.data.fires ?? []) : []}
          quakes={layers.quakes ? (data?.data.quakes ?? []) : []}
          pins={pins}
          onMoveEnd={handleMoveEnd}
          className="h-[60vh] min-h-[420px] w-full"
          ariaLabel="National hazard map"
        />
        {error ? (
          <div role="status" className="absolute left-3 right-3 top-3 z-[400] rounded-control border border-accent/40 bg-accent-soft px-3 py-2 text-sm text-accent-foreground shadow">
            {error}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-orange-500" aria-hidden /> Satellite hotspot (NASA FIRMS)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-red-600" aria-hidden /> Named incident (NIFC)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-violet-500/60" aria-hidden /> Earthquake (USGS), size = magnitude
        </span>
        {loading ? <span>Updating…</span> : null}
        {data?.meta.fires_updated_at ? <span>Fires updated {relativeTime(data.meta.fires_updated_at)}</span> : null}
        {data?.meta.quakes_updated_at ? <span>Quakes updated {relativeTime(data.meta.quakes_updated_at)}</span> : null}
        <span>{data ? `${data.data.fires.length} fires · ${data.data.quakes.length} quakes in view` : ''}</span>
      </div>
    </div>
  );
}

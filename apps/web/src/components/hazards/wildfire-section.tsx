import { Flame } from 'lucide-react';
import { formatMiles, type LocationHazardsResponse } from '@allclear/shared';
import { formatDateTime, formatNumber } from '@/lib/format';
import { EmptyState } from '@/components/ui/empty-state';
import { HazardMap } from '@/components/map/hazard-map';
import { HazardSection } from './section';

type Wildfire = NonNullable<LocationHazardsResponse['wildfire']>;

interface Props {
  wildfire: Wildfire;
  center: { latitude: number; longitude: number; label: string };
}

export function WildfireSection({ wildfire, center }: Props) {
  const { hotspots, incidents, radius_miles } = wildfire;
  const nothing = hotspots.length === 0 && incidents.length === 0;
  const fires = [
    ...incidents.map((i) => ({
      latitude: i.latitude,
      longitude: i.longitude,
      detected_at: i.updated_at,
      source: i.source,
      kind: 'incident' as const,
      name: i.name,
      containment_pct: i.containment_pct,
      acres: i.acres,
    })),
    ...hotspots.map((h) => ({ latitude: h.latitude, longitude: h.longitude, detected_at: h.detected_at, source: h.source, kind: 'hotspot' as const })),
  ];
  const zoom = radius_miles <= 15 ? 10 : radius_miles <= 30 ? 9 : radius_miles <= 60 ? 8 : 7;

  return (
    <HazardSection title="Wildfire & Smoke" source="firms" stale={wildfire.stale} icon={<Flame className="h-4 w-4" aria-hidden />} id="wildfire">
      {nothing ? (
        <EmptyState
          tone="good"
          icon={<Flame className="h-6 w-6" aria-hidden />}
          title={`No active fires within ${radius_miles} miles`}
          description="No satellite hotspots or named incidents near this location right now."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="h-56 overflow-hidden rounded-card border border-slate-200">
            <HazardMap
              center={[center.latitude, center.longitude]}
              zoom={zoom}
              fires={fires}
              pins={[{ latitude: center.latitude, longitude: center.longitude, label: center.label }]}
              interactive={false}
              className="h-56 w-full"
              ariaLabel={`Fires near ${center.label}`}
            />
          </div>
          {incidents.length > 0 ? (
            <ul className="divide-y divide-slate-100" aria-label="Named incidents">
              {incidents.map((i) => (
                <li key={i.id} className="flex flex-col gap-0.5 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-900">
                      {i.url ? (
                        <a href={i.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                          {i.name}
                        </a>
                      ) : (
                        i.name
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-700">{formatMiles(i.distance_miles)} away</span>
                  </div>
                  <p className="text-slate-600">
                    {i.containment_pct !== null ? `${Math.round(i.containment_pct)}% contained` : 'Containment unknown'}
                    {i.acres !== null ? ` · ${formatNumber(i.acres)} acres` : ''}
                    {i.status ? ` · ${i.status}` : ''}
                    {i.updated_at ? ` · updated ${formatDateTime(i.updated_at)}` : ''}
                  </p>
                  <p className="text-xs text-slate-500">Source: NIFC / InciWeb</p>
                </li>
              ))}
            </ul>
          ) : null}
          {hotspots.length > 0 ? (
            <p className="text-sm text-slate-700">
              <span className="font-medium">{hotspots.length}</span> satellite hotspot{hotspots.length === 1 ? '' : 's'} within {radius_miles} miles
              {hotspots[0] ? <span className="text-slate-500"> · nearest {formatMiles(hotspots[0].distance_miles)}</span> : null}
              <span className="block text-xs text-slate-500">
                Hotspots are automated heat detections and can include controlled burns, industrial sources or false positives.
              </span>
            </p>
          ) : null}
        </div>
      )}
    </HazardSection>
  );
}

import { CloudSun } from 'lucide-react';
import type { WeatherDTO } from '@allclear/shared';
import { formatHour, formatTemp } from '@/lib/format';
import { EmptyState } from '@/components/ui/empty-state';
import { HazardSection } from './section';

export function WeatherSection({ weather }: { weather: WeatherDTO }) {
  const { current, hourly, daily } = weather;
  const hasData = current || hourly.length > 0 || daily.length > 0;
  return (
    <HazardSection title="Weather" source="nws" fetchedAt={weather.fetched_at} stale={weather.stale} icon={<CloudSun className="h-4 w-4" aria-hidden />} id="weather">
      {!hasData ? (
        <EmptyState
          title="Forecast not loaded yet"
          description="We refresh National Weather Service forecasts every 15 minutes. Check back shortly."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {current ? (
            <div className="flex items-end gap-4">
              <span className="text-5xl font-semibold tabular-nums tracking-tight">{formatTemp(current.temp_f)}</span>
              <div className="pb-1 text-sm text-slate-600">
                <p className="font-medium text-slate-800">{current.conditions}</p>
                <p>
                  {current.humidity_pct !== null ? `Humidity ${Math.round(current.humidity_pct)}%` : null}
                  {current.humidity_pct !== null && current.wind_mph !== null ? ' · ' : null}
                  {current.wind_mph !== null ? `Wind ${Math.round(current.wind_mph)} mph` : null}
                </p>
                <p className="text-xs text-slate-500">
                  {current.basis === 'observation' ? `Observed at ${current.station ?? 'nearby station'}` : 'From the hourly forecast'}
                </p>
              </div>
            </div>
          ) : null}

          {hourly.length > 0 ? (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Next hours</h4>
              <ol className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" aria-label="Hourly forecast">
                {hourly.slice(0, 12).map((h) => (
                  <li key={h.time} className="flex min-w-[64px] flex-col items-center rounded-control bg-slate-50 px-2 py-2 text-center">
                    <span className="text-xs text-slate-500">{formatHour(h.time)}</span>
                    <span className="text-base font-semibold tabular-nums">{formatTemp(h.temp_f)}</span>
                    <span className="line-clamp-2 text-[11px] leading-tight text-slate-600">{h.conditions}</span>
                    {h.precip_pct ? <span className="text-[11px] text-primary">{h.precip_pct}%</span> : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {daily.length > 0 ? (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">7-day forecast</h4>
              <ol className="divide-y divide-slate-100" aria-label="Daily forecast">
                {daily.slice(0, 7).map((d) => (
                  <li key={d.date} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="w-24 shrink-0 font-medium text-slate-800">{d.name}</span>
                    <span className="flex-1 truncate text-slate-600">{d.conditions}</span>
                    <span className="shrink-0 tabular-nums">
                      <span className="font-semibold">{formatTemp(d.high_f)}</span>
                      <span className="text-slate-400"> / {formatTemp(d.low_f)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      )}
    </HazardSection>
  );
}

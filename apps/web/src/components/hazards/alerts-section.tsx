import { ShieldCheck, Siren } from 'lucide-react';
import type { OfficialAlertDTO } from '@allclear/shared';
import { formatDateTime } from '@/lib/format';
import { EmptyState } from '@/components/ui/empty-state';
import { SeverityBadge, alertClass } from './severity-badge';
import { HazardSection } from './section';

export function AlertsSection({ alerts }: { alerts: OfficialAlertDTO[] }) {
  return (
    <HazardSection title="Official Alerts" source="nws" icon={<Siren className="h-4 w-4" aria-hidden />} id="official-alerts">
      {alerts.length === 0 ? (
        <EmptyState
          tone="good"
          icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
          title="No active alerts for this location"
          description="No watches, warnings or advisories from the National Weather Service right now."
        />
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Active official alerts">
          {alerts.map((a) => {
            const cls = alertClass(a.event);
            const danger = cls === 'Warning' || a.severity === 'Extreme' || a.severity === 'Severe';
            return (
              <li
                key={a.id}
                className={
                  danger
                    ? 'rounded-card border border-alert/30 bg-alert-soft/60 p-4'
                    : 'rounded-card border border-accent/30 bg-accent-soft/60 p-4'
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{a.event}</span>
                  <SeverityBadge severity={a.severity} />
                  <span className="text-xs text-slate-600">{cls}</span>
                </div>
                {a.headline ? <p className="mt-1 text-sm text-slate-800">{a.headline}</p> : null}
                {a.instruction ? <p className="mt-2 text-sm text-slate-700">{a.instruction}</p> : null}
                <p className="mt-2 text-xs text-slate-500">
                  {a.sender ? `${a.sender} · ` : ''}
                  {a.expires_at ? `expires ${formatDateTime(a.expires_at)}` : ''}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </HazardSection>
  );
}

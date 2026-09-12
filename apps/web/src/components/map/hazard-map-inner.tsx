'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import { aqiCategory, type MapFireDTO, type MapQuakeDTO } from '@allclear/shared';
import { formatDateTime, formatNumber } from '@/lib/format';

export interface MapPin {
  latitude: number;
  longitude: number;
  label: string;
  radiusMiles?: number | null;
}

export interface HazardMapProps {
  center: [number, number];
  zoom: number;
  fires?: MapFireDTO[];
  quakes?: MapQuakeDTO[];
  pins?: MapPin[];
  interactive?: boolean;
  fitBounds?: LatLngBoundsExpression;
  onMoveEnd?: (bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number }, zoom: number) => void;
  onClick?: (latlng: { latitude: number; longitude: number }) => void;
  className?: string;
  ariaLabel?: string;
}

function Events({ onMoveEnd, onClick }: Pick<HazardMapProps, 'onMoveEnd' | 'onClick'>) {
  const map = useMapEvents({
    moveend() {
      if (!onMoveEnd) return;
      const b = map.getBounds();
      onMoveEnd(
        { minLng: b.getWest(), minLat: b.getSouth(), maxLng: b.getEast(), maxLat: b.getNorth() },
        map.getZoom(),
      );
    },
    click(e) {
      onClick?.({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    },
  });
  useEffect(() => {
    if (!onMoveEnd) return;
    const b = map.getBounds();
    onMoveEnd({ minLng: b.getWest(), minLat: b.getSouth(), maxLng: b.getEast(), maxLat: b.getNorth() }, map.getZoom());
    // Fire once on mount so the first viewport loads data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function Recenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  return null;
}

function quakeRadius(magnitude: number): number {
  return Math.max(4, Math.min(22, magnitude * 3));
}

/** Leaflet map with OpenStreetMap tiles and vector hazard markers (no image icons, no API key). */
export default function HazardMapInner({
  center,
  zoom,
  fires = [],
  quakes = [],
  pins = [],
  interactive = true,
  onMoveEnd,
  onClick,
  className,
  ariaLabel = 'Map',
}: HazardMapProps) {
  const good = aqiCategory(0).epaColor;
  void good;
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className={className ?? 'h-full w-full'}
      scrollWheelZoom={interactive}
      dragging={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      keyboard={interactive}
      zoomControl={interactive}
      attributionControl
      aria-label={ariaLabel}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter center={center} zoom={zoom} />
      {interactive ? <Events onMoveEnd={onMoveEnd} onClick={onClick} /> : null}

      {pins.map((pin, i) => (
        <CircleMarker
          key={`pin-${i}`}
          center={[pin.latitude, pin.longitude]}
          radius={8}
          pathOptions={{ color: '#0f6b66', fillColor: '#0f6b66', fillOpacity: 0.9, weight: 2 }}
        >
          <Popup>{pin.label}</Popup>
        </CircleMarker>
      ))}

      {fires.map((f, i) => (
        <CircleMarker
          key={`fire-${i}`}
          center={[f.latitude, f.longitude]}
          radius={f.kind === 'incident' ? 7 : 4}
          pathOptions={{
            color: f.kind === 'incident' ? '#b91c1c' : '#ea580c',
            fillColor: f.kind === 'incident' ? '#dc2626' : '#f97316',
            fillOpacity: 0.75,
            weight: 1,
          }}
        >
          <Popup>
            <strong>{f.kind === 'incident' ? (f.name ?? 'Wildfire incident') : 'Satellite hotspot'}</strong>
            <br />
            {f.kind === 'incident' ? (
              <>
                {f.containment_pct !== null && f.containment_pct !== undefined ? `${Math.round(f.containment_pct)}% contained` : 'Containment unknown'}
                {f.acres ? ` · ${formatNumber(f.acres)} acres` : ''}
                <br />
              </>
            ) : null}
            Detected {formatDateTime(f.detected_at)}
            <br />
            <span style={{ fontSize: 11 }}>Source: {f.source === 'firms' ? 'NASA FIRMS' : 'NIFC / InciWeb'}</span>
          </Popup>
        </CircleMarker>
      ))}

      {quakes.map((q, i) => (
        <CircleMarker
          key={`quake-${i}`}
          center={[q.latitude, q.longitude]}
          radius={quakeRadius(q.magnitude)}
          pathOptions={{ color: '#6d28d9', fillColor: '#8b5cf6', fillOpacity: 0.45, weight: 1 }}
        >
          <Popup>
            <strong>M{q.magnitude.toFixed(1)}</strong> — {q.place}
            <br />
            {formatDateTime(q.occurred_at)}
            <br />
            <span style={{ fontSize: 11 }}>Source: USGS</span>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

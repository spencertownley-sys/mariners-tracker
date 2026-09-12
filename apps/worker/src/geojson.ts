/** Minimal GeoJSON → EWKT conversion for NWS alert polygons (PostGIS geography input). */
type Position = number[];
interface Geometry {
  type: string;
  coordinates?: unknown;
  geometries?: Geometry[];
}

function ring(coords: Position[]): string {
  return `(${coords.map((c) => `${c[0]} ${c[1]}`).join(',')})`;
}

function polygon(coords: Position[][]): string {
  return `(${coords.map(ring).join(',')})`;
}

export function geojsonToEwkt(geometry: Geometry | null | undefined): string | null {
  if (!geometry) return null;
  switch (geometry.type) {
    case 'Point': {
      const c = geometry.coordinates as Position;
      return `SRID=4326;POINT(${c[0]} ${c[1]})`;
    }
    case 'Polygon':
      return `SRID=4326;POLYGON${polygon(geometry.coordinates as Position[][])}`;
    case 'MultiPolygon':
      return `SRID=4326;MULTIPOLYGON(${(geometry.coordinates as Position[][][]).map(polygon).join(',')})`;
    case 'GeometryCollection': {
      const parts = (geometry.geometries ?? []).map((g) => geojsonToEwkt(g)?.replace('SRID=4326;', '')).filter(Boolean);
      return parts.length ? `SRID=4326;GEOMETRYCOLLECTION(${parts.join(',')})` : null;
    }
    default:
      return null;
  }
}

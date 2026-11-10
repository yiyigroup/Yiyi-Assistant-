import { REGION_SEEDS, type RegionLabel } from "@/lib/config/region-seeds";

export type RegionProposal =
  | { status: "exact"; region: RegionLabel; zip: string }
  | { status: "nearby"; region: RegionLabel; zip: string; note: "附近邮编，需确认" }
  | { status: "conflict"; note: "区域待确认" }
  | { status: "none" };

/** Minimal pinned fixture centroids for seed ZIPs + a few neighbors (miles). */
export const ZIP_CENTROIDS: Record<string, { lat: number; lon: number }> = {
  "94506": { lat: 37.8185, lon: -121.915 },
  "94566": { lat: 37.6604, lon: -121.875 },
  "94568": { lat: 37.7132, lon: -121.889 },
  "94588": { lat: 37.699, lon: -121.906 },
  "95008": { lat: 37.279, lon: -121.956 },
  "95032": { lat: 37.23, lon: -121.906 },
  "95070": { lat: 37.268, lon: -122.02 },
  "95117": { lat: 37.31, lon: -121.96 },
  "95118": { lat: 37.253, lon: -121.89 },
  "95123": { lat: 37.242, lon: -121.827 },
  "95124": { lat: 37.256, lon: -121.92 },
  "95125": { lat: 37.296, lon: -121.89 },
  // neighbors within ~10 mi of seeds for tests
  "94507": { lat: 37.823, lon: -121.95 },
  "95014": { lat: 37.318, lon: -122.045 },
  "21028": { lat: 39.55, lon: -76.3 }, // street-number trap, not Bay Area
};

function haversineMiles(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function normalizeZip(raw: string): string | null {
  const m = String(raw || "")
    .trim()
    .match(/^(\d{5})(?:-\d{4})?$/);
  return m?.[1] ?? null;
}

/**
 * Prefer dedicated ZIP column. Never treat arbitrary 5-digit street numbers as ZIP
 * without validation context — callers should pass only column/address-validated values.
 */
export function proposeRegion(zipRaw: string): RegionProposal {
  const zip = normalizeZip(zipRaw);
  if (!zip) return { status: "conflict", note: "区域待确认" };

  const exactHits: RegionLabel[] = [];
  for (const [region, seeds] of Object.entries(REGION_SEEDS) as [
    RegionLabel,
    readonly string[],
  ][]) {
    if (seeds.includes(zip)) exactHits.push(region);
  }
  if (exactHits.length === 1) {
    return { status: "exact", region: exactHits[0]!, zip };
  }
  if (exactHits.length > 1) return { status: "conflict", note: "区域待确认" };

  const centroid = ZIP_CENTROIDS[zip];
  if (!centroid) return { status: "none" };

  const nearby: { region: RegionLabel; dist: number }[] = [];
  for (const [region, seeds] of Object.entries(REGION_SEEDS) as [
    RegionLabel,
    readonly string[],
  ][]) {
    for (const seed of seeds) {
      const c = ZIP_CENTROIDS[seed];
      if (!c) continue;
      const dist = haversineMiles(centroid, c);
      if (dist <= 10) nearby.push({ region, dist });
    }
  }
  if (!nearby.length) return { status: "none" };
  const regions = [...new Set(nearby.map((n) => n.region))];
  if (regions.length !== 1) return { status: "conflict", note: "区域待确认" };
  return {
    status: "nearby",
    region: regions[0]!,
    zip,
    note: "附近邮编，需确认",
  };
}

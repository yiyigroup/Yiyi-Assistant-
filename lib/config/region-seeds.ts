/** Server-owned regional ZIP seeds. Never accept client-supplied seed lists. */
export const REGION_SEEDS = {
  三谷: ["94506", "94566", "94568", "94588"],
  "95008": ["95008", "95032", "95070", "95117", "95118", "95123", "95124", "95125"],
} as const;

export type RegionLabel = keyof typeof REGION_SEEDS;

export function seedZipsFor(region: RegionLabel): readonly string[] {
  return REGION_SEEDS[region];
}

export function allSeedZips(): string[] {
  return Object.values(REGION_SEEDS).flat();
}

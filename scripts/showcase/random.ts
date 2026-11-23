// A seeded generator (mulberry32), so every run builds the same Tenant and
// screenshots can be retaken.
export const createRandom = (seed: number) => {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = (min: number, max: number) => min + next() * (max - min);
  const integer = (min: number, max: number) => Math.floor(between(min, max + 1));
  const chance = (probability: number) => next() < probability;
  const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)];
  // An index drawn in proportion to its weight.
  const weighted = (weights: readonly number[]) => {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let target = next() * total;
    for (const [index, weight] of weights.entries()) {
      target -= weight;
      if (target < 0) return index;
    }
    return weights.length - 1;
  };
  const digits = (count: number) => Array.from({ length: count }, () => integer(0, 9)).join("");
  return { next, between, integer, chance, pick, weighted, digits };
};

export type Random = ReturnType<typeof createRandom>;

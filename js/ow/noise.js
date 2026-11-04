// Deterministic randomness: everything about a chunk comes from the world seed and its coordinates.

export function hash2(x, z, seed = 0) {
  let h = (x * 374761393 + z * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 1 | s);
    s = (s + Math.imul(s ^ (s >>> 7), 61 | s)) ^ s;
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

export const chunkSeed = (cx, cz, seed) => Math.floor(hash2(cx, cz, seed) * 4294967296);

export const pick = (r, list) => list[Math.floor(r() * list.length)];

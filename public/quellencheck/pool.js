/**
 * pool.js
 * Führt async-Aufgaben mit begrenzter Parallelität aus.
 *
 * @template T
 * @param {T[]} items
 * @param {number} limit   Maximale Anzahl gleichzeitiger Aufgaben
 * @param {(item:T, index:number) => Promise<void>} fn
 */
export async function runPool(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

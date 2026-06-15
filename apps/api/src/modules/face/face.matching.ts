/** Hàm thuần cho khớp khuôn mặt + geofence — tách riêng để unit test. */

/** Cosine similarity 2 vector cùng chiều, [-1, 1]. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i]!;
    const bv = b[i]!;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Điểm khớp cao nhất giữa 1 vector và tập embeddings đã enroll. */
export function bestMatch(candidate: number[], enrolled: number[][]): number {
  let best = -1;
  for (const e of enrolled) {
    const score = cosineSimilarity(candidate, e);
    if (score > best) best = score;
  }
  return best;
}

const EARTH_RADIUS_M = 6_371_000;

/** Khoảng cách haversine giữa 2 toạ độ (mét). */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

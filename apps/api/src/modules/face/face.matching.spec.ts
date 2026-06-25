import { bestMatch, cosineSimilarity, haversineMeters } from './face.matching';

describe('cosineSimilarity', () => {
  it('vector trùng → 1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });
  it('vector vuông góc → 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
  it('vector ngược chiều → -1', () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 5);
  });
  it('khác chiều dài hoặc rỗng → 0', () => {
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe('bestMatch', () => {
  const enrolled = [
    [1, 0, 0],
    [0, 1, 0],
  ];
  it('lấy điểm cao nhất trong tập enroll', () => {
    // gần [1,0,0] nhất
    expect(bestMatch([0.9, 0.1, 0], enrolled)).toBeGreaterThan(0.9);
  });
  it('giống người: vượt ngưỡng 0.55; khác người: dưới ngưỡng', () => {
    const same = bestMatch([0.95, 0.05, 0.05], enrolled);
    const diff = bestMatch([0.1, 0.1, 0.99], enrolled);
    expect(same).toBeGreaterThanOrEqual(0.55);
    expect(diff).toBeLessThan(0.55);
  });
});

describe('haversineMeters', () => {
  it('cùng điểm → 0m', () => {
    expect(haversineMeters(10.776, 106.7, 10.776, 106.7)).toBeCloseTo(0, 1);
  });
  it('~111m cho 0.001 độ vĩ độ', () => {
    const d = haversineMeters(10.776, 106.7, 10.777, 106.7);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });
  it('ngoài bán kính 100m phát hiện được', () => {
    // cách ~333m theo vĩ độ
    const d = haversineMeters(10.776, 106.7, 10.779, 106.7);
    expect(d).toBeGreaterThan(100);
  });

  it('quyết định geofence: trong bán kính PASS, ngoài bán kính FAIL', () => {
    const wsLat = 10.776;
    const wsLng = 106.7;
    const radiusM = 100;
    // ~55m (0.0005°) → trong bán kính
    const near = haversineMeters(wsLat + 0.0005, wsLng, wsLat, wsLng);
    // ~333m (0.003°) → ngoài bán kính
    const far = haversineMeters(wsLat + 0.003, wsLng, wsLat, wsLng);
    expect(near <= radiusM).toBe(true);
    expect(far <= radiusM).toBe(false);
  });
});

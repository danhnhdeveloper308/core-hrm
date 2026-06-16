import { matchConditions, selectFlow } from './approval.conditions';

describe('matchConditions', () => {
  const ctx = { totalDays: 5, leaveTypeCode: 'ANNUAL', paid: true };

  it('null/rỗng → match tất cả (flow mặc định)', () => {
    expect(matchConditions(null, ctx)).toBe(true);
    expect(matchConditions({}, ctx)).toBe(true);
  });
  it('toán tử gt', () => {
    expect(matchConditions({ totalDays: { gt: 3 } }, ctx)).toBe(true);
    expect(matchConditions({ totalDays: { gt: 10 } }, ctx)).toBe(false);
  });
  it('so sánh bằng trực tiếp', () => {
    expect(matchConditions({ leaveTypeCode: 'ANNUAL' }, ctx)).toBe(true);
    expect(matchConditions({ leaveTypeCode: 'UNPAID' }, ctx)).toBe(false);
  });
  it('in + nhiều field AND', () => {
    expect(
      matchConditions({ leaveTypeCode: { in: ['ANNUAL', 'SICK'] }, paid: true }, ctx),
    ).toBe(true);
    expect(matchConditions({ paid: false }, ctx)).toBe(false);
  });
});

describe('selectFlow', () => {
  const flows = [
    { id: 'default', priority: 0, conditions: null },
    { id: 'long', priority: 10, conditions: { totalDays: { gt: 3 } } },
    { id: 'unpaid', priority: 20, conditions: { leaveTypeCode: 'UNPAID' } },
  ];
  it('đơn dài (>3 ngày) → flow priority cao "long"', () => {
    expect(selectFlow(flows, { totalDays: 5 })?.id).toBe('long');
  });
  it('đơn ngắn → flow mặc định', () => {
    expect(selectFlow(flows, { totalDays: 1 })?.id).toBe('default');
  });
  it('đơn UNPAID dài → priority cao nhất "unpaid"', () => {
    expect(selectFlow(flows, { totalDays: 5, leaveTypeCode: 'UNPAID' })?.id).toBe('unpaid');
  });
  it('không flow nào match + không default → null', () => {
    expect(selectFlow([{ id: 'x', priority: 1, conditions: { totalDays: { gt: 99 } } }], { totalDays: 1 })).toBeNull();
  });
});

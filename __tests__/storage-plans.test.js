const { STORAGE_PLANS, getPlanById } = require('../config/storage-plans');

describe('storage-plans config', () => {
  test('exports exactly 4 plans', () => {
    expect(STORAGE_PLANS).toHaveLength(4);
  });

  test('every plan has the required fields with correct types', () => {
    for (const plan of STORAGE_PLANS) {
      expect(typeof plan.id).toBe('string');
      expect(typeof plan.name).toBe('string');
      expect(typeof plan.storageLabel).toBe('string');
      expect(typeof plan.storageLimitBytes).toBe('number');
      expect(plan.storageLimitBytes).toBeGreaterThan(0);
      expect(typeof plan.priceMonthly).toBe('number');
      expect(typeof plan.isRecommended).toBe('boolean');
      expect(Array.isArray(plan.features)).toBe(true);
      expect(plan.features.length).toBeGreaterThan(0);
    }
  });

  test('exactly one plan is marked as recommended', () => {
    const recommended = STORAGE_PLANS.filter((p) => p.isRecommended);
    expect(recommended).toHaveLength(1);
  });

  test('free plan has priceMonthly of 0', () => {
    const free = getPlanById('free');
    expect(free).not.toBeNull();
    expect(free.priceMonthly).toBe(0);
  });

  test('all paid plans have priceMonthly > 0', () => {
    const paid = STORAGE_PLANS.filter((p) => p.id !== 'free');
    for (const plan of paid) {
      expect(plan.priceMonthly).toBeGreaterThan(0);
    }
  });

  test('storage limits are strictly ascending across plans', () => {
    for (let i = 1; i < STORAGE_PLANS.length; i++) {
      expect(STORAGE_PLANS[i].storageLimitBytes).toBeGreaterThan(
        STORAGE_PLANS[i - 1].storageLimitBytes
      );
    }
  });

  test('getPlanById returns the correct plan', () => {
    for (const plan of STORAGE_PLANS) {
      expect(getPlanById(plan.id)).toBe(plan);
    }
  });

  test('getPlanById returns null for an unknown id', () => {
    expect(getPlanById('nonexistent')).toBeNull();
    expect(getPlanById('')).toBeNull();
  });
});

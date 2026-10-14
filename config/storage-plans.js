// Central source of truth for storage plan definitions.
// All limits, prices and features are defined here once.
const STORAGE_PLANS = [
  {
    id: 'free',
    name: 'Free',
    storageLabel: '500 MB',
    storageLimitBytes: 500 * 1024 * 1024, // 524_288_000
    priceMonthly: 0,
    isRecommended: false,
    description: 'Perfect for getting started',
    features: [
      '500 MB of cloud storage',
      'Photos & videos backup',
      'Standard encryption',
      'Access on all devices',
    ],
  },
  {
    id: 'plus',
    name: 'Plus',
    storageLabel: '10 GB',
    storageLimitBytes: 10 * 1024 * 1024 * 1024,
    priceMonthly: 1.99,
    isRecommended: false,
    description: 'Great for everyday journaling',
    features: [
      '10 GB of cloud storage',
      'Photos & videos backup',
      'End-to-end encryption',
      'Access on all devices',
      'Priority support',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    storageLabel: '50 GB',
    storageLimitBytes: 50 * 1024 * 1024 * 1024,
    priceMonthly: 4.99,
    isRecommended: true,
    description: 'Best for avid memory-keepers',
    features: [
      '50 GB of cloud storage',
      'Photos & videos backup',
      'End-to-end encryption',
      'Access on all devices',
      'Priority support',
      'Advanced search & filters',
    ],
  },
  {
    id: 'vault',
    name: 'Vault',
    storageLabel: '200 GB',
    storageLimitBytes: 200 * 1024 * 1024 * 1024,
    priceMonthly: 9.99,
    isRecommended: false,
    description: 'For the ultimate archivist',
    features: [
      '200 GB of cloud storage',
      'Photos & videos backup',
      'End-to-end encryption',
      'Access on all devices',
      'Priority support',
      'Advanced search & filters',
      'Bulk export & download',
    ],
  },
];

/**
 * Look up a plan by id. Returns null if not found.
 * @param {string} id
 * @returns {object|null}
 */
function getPlanById(id) {
  return STORAGE_PLANS.find((p) => p.id === id) || null;
}

module.exports = { STORAGE_PLANS, getPlanById };

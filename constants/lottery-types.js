export const LOTTERY_TYPES = {
  HOURLY: {
    name: "hourly",
    code: "1H",
    durationSeconds: 1 * 60 * 60, // 1 hour
  },
  SIX_HOURLY: {
    name: "six_hourly",
    code: "6H",
    durationSeconds: 6 * 60 * 60, // 6 hours
  },
  DAILY: {
    name: "daily",
    code: "DA",
    durationSeconds: 24 * 60 * 60, // 24 hours
  },
  WEEKLY: {
    name: "weekly",
    code: "WE",
    durationSeconds: 7 * 24 * 60 * 60, // 7 days
  },
  MONTHLY: {
    name: "monthly",
    code: "MO",
    durationSeconds: 30 * 24 * 60 * 60, // ~30 days
  },
  YEARLY: {
    name: "yearly",
    code: "YE",
    durationSeconds: 365 * 24 * 60 * 60, // ~365 days
  },
};

// For enums in schema you need only the names:
export const LOTTERY_TYPE_NAMES = Object.values(LOTTERY_TYPES).map(t => t.name);
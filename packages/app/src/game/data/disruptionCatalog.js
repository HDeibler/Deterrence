export const DISRUPTION_TARGETS = {
  oil_field: {
    label: 'Oil Field',
    damageCapacity: 1.0,
    recoveryRatePerHour: 0.01,
    cascadeKeys: ['oil'],
    economicMultiplier: 1.5,
  },
  rare_earth_mine: {
    label: 'Rare Earth Mine',
    damageCapacity: 1.0,
    recoveryRatePerHour: 0.008,
    cascadeKeys: ['rare_earths'],
    economicMultiplier: 2.0,
  },
  chip_factory: {
    label: 'Chip Factory',
    damageCapacity: 1.0,
    recoveryRatePerHour: 0.005,
    cascadeKeys: ['chips'],
    economicMultiplier: 3.0,
  },
  military_factory: {
    label: 'Military Factory',
    damageCapacity: 1.0,
    recoveryRatePerHour: 0.006,
    cascadeKeys: ['military_output'],
    economicMultiplier: 2.5,
  },
  port: {
    label: 'Port',
    damageCapacity: 1.0,
    recoveryRatePerHour: 0.012,
    cascadeKeys: ['trade_throughput'],
    economicMultiplier: 1.8,
  },
  hub_base: {
    label: 'Hub Base',
    damageCapacity: 1.0,
    recoveryRatePerHour: 0.007,
    cascadeKeys: ['logistics_throughput'],
    economicMultiplier: 2.2,
  },
  spaceport: {
    label: 'Spaceport',
    damageCapacity: 1.0,
    recoveryRatePerHour: 0.003,
    cascadeKeys: ['launch_capability'],
    economicMultiplier: 4.0,
  },
  supply_route: {
    label: 'Supply Route',
    damageCapacity: 0.8,
    recoveryRatePerHour: 0.02,
    cascadeKeys: ['route_capacity'],
    economicMultiplier: 1.2,
  },
};

export const CASCADE_RULES = {
  oil: {
    affectedOutputs: ['military_output', 'logistics_throughput'],
    propagationFactor: 0.6,
  },
  rare_earths: {
    affectedOutputs: ['chips'],
    propagationFactor: 0.8,
  },
  chips: {
    affectedOutputs: ['military_output', 'launch_capability'],
    propagationFactor: 0.7,
  },
  military_output: {
    affectedOutputs: [],
    propagationFactor: 0,
  },
  trade_throughput: {
    affectedOutputs: ['oil', 'rare_earths', 'chips'],
    propagationFactor: 0.4,
  },
  logistics_throughput: {
    affectedOutputs: ['military_output'],
    propagationFactor: 0.5,
  },
  launch_capability: {
    affectedOutputs: [],
    propagationFactor: 0,
  },
  route_capacity: {
    affectedOutputs: ['trade_throughput', 'logistics_throughput'],
    propagationFactor: 0.3,
  },
};

/** KPI rows shown on the scorecard and settable as monthly targets. */
export const KPI_DEFS = [
  { key: 'revenue', label: 'Total revenue', format: 'money' },
  { key: 'averageSale', label: 'Average sale value', format: 'money' },
  { key: 'clientsServed', label: 'Clients served', format: 'count' },
  { key: 'newClients', label: 'New clients', format: 'count' },
  { key: 'retentionRate', label: 'Client retention rate (%)', format: 'percent' },
  { key: 'noShowRate', label: 'No-show rate (%) — lower is better', format: 'percent' },
  { key: 'therapistUtilization', label: 'Therapist utilisation (%)', format: 'percent' },
  { key: 'revenuePerTherapist', label: 'Revenue per therapist', format: 'money' },
  { key: 'roomOccupancy', label: 'Room / bed occupancy (%)', format: 'percent' },
  { key: 'activeMemberships', label: 'Active memberships', format: 'count' },
  { key: 'membershipRenewalRate', label: 'Membership renewal rate (%)', format: 'percent' },
  { key: 'averageRating', label: 'Average client rating (stars)', format: 'rating' },
] as const;

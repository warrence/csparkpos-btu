// Optional saved metadata only. Never validate or normalize payment identity.
export const hasOpnVehicle = value => typeof value === 'string' && value.trim().length > 0;
export function sharedOpnVehicle(items) {
  const rows = Array.from(items);
  const first = rows.length ? rows[0].carNo : null;
  return hasOpnVehicle(first) && rows.every(row => row.carNo === first) ? first : null;
}

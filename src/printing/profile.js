// Printers can outlive Load Data's profile replacement. Never retain a Realm
// object: capture only the primitive header/rate fields for this print attempt.
export function printProfileSnapshot(database) {
  const profile = database.objects('GeneralProfile')[0];
  if (!profile) throw new Error('Load company and pondok settings before printing.');
  const fields = ['companyName', 'CompanyNo', 'GstRegNo', 'Address1', 'Address2', 'Address3',
    'Telephone1', 'Telephone2', 'Telephone3', 'PondokId', 'Tax'];
  return Object.freeze(fields.reduce((snapshot, field) => {
    snapshot[field] = profile[field];
    return snapshot;
  }, {}));
}

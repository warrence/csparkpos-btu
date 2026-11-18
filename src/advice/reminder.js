// Existing office pareceipt/compound Rem_no columns are VARCHAR(20).
export function adviceReminder(value) {
  if(value==null)return '';
  if(typeof value!=='string')throw new Error('Reminder number must be text.');
  const reminder=value.trim();
  if(reminder.length>20)throw new Error('Reminder number must be at most 20 characters.');
  return reminder;
}

import {cents} from '../advice/collection';

export function configuredOpnRates(database) {
  const rows=Array.from(database.objects('OpTable'));
  if(!rows.length) throw new Error('Load configured OPN amounts from the office before collecting.');
  const rates=rows.map(row=>{
    const value=cents(row.amount,'Configured OPN amount');
    if(value<=0) throw new Error('Load a valid positive OPN amount from the office before collecting.');
    return value/100;
  });
  return Array.from(new Set(rates));
}

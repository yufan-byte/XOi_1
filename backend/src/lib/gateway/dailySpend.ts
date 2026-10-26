import {db} from '@/utils/db';
import {DailySpendStore} from './dailySpendStore';
const store=new DailySpendStore(db);
export const dailySpendStatus=(owner:number)=>store.status(owner);
export const setDailySpendPreference=(owner:number,yuan:number)=>store.save(owner,yuan);
export const claimDailySpendNotice=(owner:number)=>store.claim(owner);

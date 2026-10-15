import {describe,it,expect} from 'vitest';
import {recurringActive,recurringOverlap} from './recurring-menu';
const window={days:[4],open:'10:00',close:'14:00',skipDates:[]};
describe('branch recurring hours',()=>{
 it('interprets the window in the branch timezone',()=>expect(recurringActive(window,'Asia/Kolkata',new Date('2026-10-15T05:00:00Z'))).toBe(true));
 it('excludes holiday dates',()=>expect(recurringActive({...window,skipDates:['2026-10-15']},'Asia/Kolkata',new Date('2026-10-15T05:00:00Z'))).toBe(false));
 it('ends precisely at the closing boundary',()=>expect(recurringActive(window,'Asia/Kolkata',new Date('2026-10-15T08:30:00Z'))).toBe(false));
 it('permits adjoining service windows but detects overlapping hours',()=>{expect(recurringOverlap(window,{...window,open:'14:00',close:'18:00'})).toBe(false);expect(recurringOverlap(window,{...window,open:'13:00',close:'18:00'})).toBe(true);});
});

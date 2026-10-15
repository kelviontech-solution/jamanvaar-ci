import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {StatusBadge} from '../packages/ui/src/StatusBadge';

describe('imported menus with incomplete dietary metadata',()=>{
  it.each([undefined,null,'','  ','UNKNOWN','NOT_SET'])('does not crash or claim a dietary classification for %s',status=>{
    const html=renderToStaticMarkup(<StatusBadge status={status} type="dietary"/>);
    expect(html).toContain('Diet not specified');expect(html).not.toContain('Pure Veg');
  });
  it.each([['VEG','Pure Veg'],['NON_VEG','Non-Veg'],['JAIN','Jain'],['EGG','Egg'],['VEGAN','Vegan']])('keeps the restaurant-provided %s classification', (status,label)=>{
    expect(renderToStaticMarkup(<StatusBadge status={status} type="dietary"/>)).toContain(label);
  });
  it('provides an honest missing operational status label',()=>{expect(renderToStaticMarkup(<StatusBadge/>)).toContain('UNKNOWN');});
});

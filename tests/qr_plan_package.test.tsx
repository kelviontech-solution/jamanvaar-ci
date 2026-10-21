import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {QrPlanCapabilities,qrPackageFlags} from '../cloud/super-admin-web/src/pages/Plans/QrPlanCapabilities';
import type {FeatureRecord} from '../cloud/super-admin-web/src/api/types';
const features=[{id:'base',code:'QR_ORDERING',legacyEntitlementKey:'qrTableOrdering',isActive:true,rolloutPercent:100,name:'QR Ordering'},{id:'analytics',code:'QR_MENU_ANALYTICS',legacyEntitlementKey:'qrMenuAnalytics',isActive:true,rolloutPercent:100,name:'Menu Performance'},{id:'page',code:'QR_RESTAURANT_PAGE',legacyEntitlementKey:'qrRestaurantPage',isActive:true,rolloutPercent:100,name:'Restaurant page'},{id:'future',code:'QR_NEW',legacyEntitlementKey:'qrFuture',isActive:false,rolloutPercent:0,name:'Future QR feature'}] as FeatureRecord[];
it('Complete includes analytics and catalogue additions and retains other purchased products',()=>{
 expect(qrPackageFlags({posTerminal:true,qrMenuAnalytics:false},features,true)).toMatchObject({posTerminal:true,qrMenuAnalytics:true,qrRestaurantPage:true,qrFuture:true,qrTableOrdering:true,menuManagement:true,tableManagement:true,foodCustomization:true});
});
it('Essential keeps the ordering prerequisites while explicitly clearing optional QR capabilities',()=>{
 expect(qrPackageFlags({posTerminal:false,qrMenuAnalytics:true},features,false)).toMatchObject({posTerminal:false,qrMenuAnalytics:false,qrRestaurantPage:false,qrTableOrdering:true,menuManagement:true,tableManagement:true});
});
it('does not invent access from the price or tier and explains platform controls',()=>{
 const html=renderToStaticMarkup(<QrPlanCapabilities features={features} flags={{qrTableOrdering:true}} loading={false} error="" onChange={()=>{}}/>);
 expect(html).toContain('1/4');expect(html).toContain('QR Complete');expect(html).toContain('higher price');expect(html).toContain('platform inactive');expect(html).toContain('Menu Performance');
});
it('cannot apply a package when the catalogue failed to load',()=>{
 const html=renderToStaticMarkup(<QrPlanCapabilities features={[]} flags={{}} loading={false} error="Catalogue unavailable" onChange={()=>{}}/>);
 expect(html).toContain('role="alert"');expect(html.match(/disabled=""/g)).toHaveLength(2);
});

// Browser-only fixture: real components, isolated admin transport; no production writes.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RestaurantPage } from '../../../packages/ui/src/restaurant-page/RestaurantPage';
import { QrRestaurantPage } from '../../../apps/restaurant-system/pos-admin/src/components/qrconsole/QrRestaurantPage';
import { QrConsole } from '../../../apps/restaurant-system/pos-admin/src/components/qrconsole/QrConsole';
import { DEFAULT_RESTAURANT_PAGE } from '../../../packages/ui/src/restaurant-page/types';
import { menuDishImage } from '../../../packages/utils/src/dish_photos';
import '../../../apps/restaurant-system/pos-admin/src/index.css';
import './browser-fixture.css';
const params = new URLSearchParams(location.search);
const categories=[{id:'meal',name:'Meals',translations:{gu:{name:'ભોજન'}}},{id:'drink',name:'Drinks',translations:{gu:{name:'પીણાં'}}},{id:'sweet',name:'Desserts',translations:{gu:{name:'મીઠાઈ'}}}];
const items = Array.from({ length: 25 }, (_, i) => ({
  id: `dish-${i}`,
  categoryId:categories[i<10?0:i<20?1:2].id,
  translations:{gu:{name:`વાનગી ${i+1}`,description:'તાજું ભોજન'}},
  name: i === 0 ? 'Royal Gujarati Grand Thali' : `House dish ${i + 1}`,
  description: i === 24 ? 'Saffron rice with herbs' : 'Prepared in our kitchen.',
  price: 100 + i,
  imageUrl: `http://localhost:5190/q${menuDishImage('', i === 0 ? 'Royal Gujarati Grand Thali' : 'Paneer Tikka')}`
}));
const draft = {
  ...DEFAULT_RESTAURANT_PAGE,
  enabled: true,
  entryMode: 'PAGE',
  title: 'A place for good food\nand good company.',
  tagline: 'River House Kitchen',
  welcome: 'Explore our menu, plan your visit and make yourself at home.',
  about: 'Our kitchen brings families together over freshly prepared meals. Visit our riverside dining room or browse what we are serving today.',
  address: 'River Road, Ahmedabad',
  hours: 'Monday – Sunday\n11 am – 10 pm',
  phone: '+919876543210',
  instagram: 'https://instagram.com/example',
  mapsUrl: 'https://maps.google.com/?q=Ahmedabad',
  reviewUrl: 'https://g.page/r/example/review',
  gallery: items.slice(0, 3).map((item) => ({ url: item.imageUrl, caption: item.name }))
};
if(params.has('enhanced'))Object.assign(draft,{businessHours:{timezone:'Asia/Kolkata',weekly:Array.from({length:7},(_,day)=>({day,intervals:[{start:'10:00',end:'22:00'}]})),exceptions:[]},translations:{gu:{title:'નદી કિનારે ભોજન',welcome:'આપનું સ્વાગત છે'}}});
const data = {
  scope: 'restaurant',
  canEditGlobal: true,
  version: 1,
  draft,
  published: structuredClone(draft),
  inherited: false,
  publishedAt: '2026-10-19T06:00:00Z',
  capability: { enabled: true, reason: 'Fixture access' },
  restaurantName: 'River House Kitchen',
  branchName: 'Riverside',
  currency: 'INR',
  defaultAddress: draft.address,
  branches: [{ id: 'branch-a', name: 'Riverside', address: draft.address }],
  affectedBranches: [{ id: 'branch-a', name: 'Riverside', licensed: true }],
  items,
  categories,
  menuReady: true,
  sharePath: null,
  shareUrl: null,
  orderOnlineUrl: 'http://localhost:5190/q/fixture-only',
  history: []
};
(window as any).__pageFixture = { data, saves: 0, publishes: 0 };
if(params.has('twoCodes'))data.branches.push({id:'branch-b',name:'Uptown',address:'Another branch'});
if(params.has('longName'))data.restaurantName='River House Kitchen, Family Dining & Riverside Celebrations';
const admin = params.get('screen') === 'admin';
createRoot(document.getElementById('root')!).render(
  params.get('screen')==='console' ? <div className="qr-admin-app"><QrConsole layout={params.get('layout')==='integrated'?'integrated':'workspace'} onViewPlan={()=>{}} showToast={()=>{}} /></div> : admin ? (
    <main style={{ padding: '24px', background: '#f7f6f1', minHeight: '100vh' }}>
      <QrRestaurantPage />
    </main>
  ) : (
    <RestaurantPage
      browseMenu
      categories={categories}
      page={{
        content: { ...draft, template: (params.get('template') || 'HERITAGE') as any },
        restaurantName: data.restaurantName,
        branchName: data.branchName,
        currency: data.currency
      }}
      items={items}
      onMenu={() => document.getElementById('rp-menu')?.scrollIntoView()}
    />
  )
);

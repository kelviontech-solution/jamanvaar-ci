import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DEFAULT_KIOSK_WELCOME_BACKGROUND, DEFAULT_WELCOME_PRESENTATION, KIOSK_WELCOME_BACKGROUNDS, optimizeWelcomeUpload, welcomeBackgroundUrl, welcomeLandscapeUrl, welcomePresentation, WelcomeImageCache } from '@jamanvaar/utils';
import { db, KioskConfigurationRepository, WelcomeScreenSettingsRepository } from '@jamanvaar/database';
import { kioskConfigurationSchema } from '../cloud/api/src/modules/entity-sync/kiosk-configuration-schema';
import { kioskActivationError } from '../apps/kiosk-system/kiosk-user/src/activationErrors';

afterEach(() => vi.unstubAllGlobals());
describe('kiosk welcome configuration', () => {
  it('ships sixteen distinct portrait masters while preserving the original collection', () => {
    const manifest = JSON.parse(readFileSync('packages/assets/branding/kiosk-welcome-v1/manifest.json', 'utf8'));
    expect(manifest.backgrounds).toHaveLength(16);
    expect(new Set(manifest.backgrounds.map((b: { sha256: string }) => b.sha256)).size).toBe(16);
    expect(KIOSK_WELCOME_BACKGROUNDS.map(b => b.id)).toEqual(manifest.backgrounds.map((b: { id: string }) => b.id));
    const serverCatalog = JSON.parse(readFileSync('cloud/api/src/modules/platform-settings/welcome-builtins.json','utf8'));
    expect(serverCatalog.map((b: { id: string; name: string; imageUrl: string; landscapeImageUrl: string }) => [b.id,b.name,b.imageUrl,b.landscapeImageUrl])).toEqual(KIOSK_WELCOME_BACKGROUNDS.map(b => [b.id,b.name,b.imageUrl,b.landscapeImageUrl]));
    for (const b of manifest.backgrounds) {
      expect([b.width,b.height]).toEqual([1080,1920]);
      expect(createHash('sha256').update(readFileSync(`packages/assets/branding/kiosk-welcome-v1/${b.file}`)).digest('hex')).toBe(b.sha256);
      expect(b.bytes).toBeLessThan(450 * 1024);
      expect([b.landscapeWidth,b.landscapeHeight]).toEqual([1920,1080]);
      expect(createHash('sha256').update(readFileSync(`packages/assets/branding/kiosk-welcome-v1/${b.landscapeFile}`)).digest('hex')).toBe(b.landscapeSha256);
      expect(b.landscapeBytes).toBeLessThan(450 * 1024);
      expect(readFileSync(`packages/assets/branding/kiosk-welcome-v1/${b.thumbnail}`).byteLength).toBeLessThan(60000);
    }
  });
  it('selects wide companions for bundled scenes and leaves custom upload compositions unchanged', () => {
    for (const background of KIOSK_WELCOME_BACKGROUNDS) expect(welcomeLandscapeUrl(background.imageUrl)).toBe(background.landscapeImageUrl);
    expect(welcomeLandscapeUrl('data:image/webp;base64,AAAA')).toBe('data:image/webp;base64,AAAA');
    expect(welcomeLandscapeUrl('/custom.jpg')).toBe('/custom.jpg');
  });
  it('resolves branch default, one-device override, custom upload and unknown-id fallback', () => {
    const settings = { ...DEFAULT_WELCOME_PRESENTATION, customBackgrounds: [{ id: 'custom-a', name: 'A', imageUrl: 'data:image/webp;base64,AAAA', width: 1080, height: 1920 }], deviceOverrides: { kioskA: { ...DEFAULT_WELCOME_PRESENTATION, backgroundId: 'custom-a', restaurantName: 'Kiosk A' } } };
    const branch = welcomePresentation(settings, 'kioskB');
    expect(branch.restaurantName).toBeUndefined();
    expect(welcomeBackgroundUrl(branch,settings.customBackgrounds)).toBe(DEFAULT_KIOSK_WELCOME_BACKGROUND.imageUrl);
    const override = welcomePresentation(settings,'kioskA');
    expect(override.restaurantName).toBe('Kiosk A');
    expect(welcomeBackgroundUrl(override,settings.customBackgrounds)).toBe('data:image/webp;base64,AAAA');
    expect(welcomeBackgroundUrl({ ...branch, backgroundId: 'unknown' })).toBe(DEFAULT_KIOSK_WELCOME_BACKGROUND.imageUrl);
  });
  it('keeps uploaded platform companions separate from another terminal using a bundled design', () => {
    const settings = { ...DEFAULT_WELCOME_PRESENTATION, backgroundId: 'platform-branch', backgroundImageUrl: '/api/v1/public/welcome-designs/platform-branch/portrait', backgroundLandscapeImageUrl: '/api/v1/public/welcome-designs/platform-branch/landscape',
      deviceOverrides: { a: { ...DEFAULT_WELCOME_PRESENTATION, backgroundId: 'midnight-spice' }, b: { ...DEFAULT_WELCOME_PRESENTATION, backgroundId: 'platform-other', backgroundImageUrl: '/api/v1/public/welcome-designs/platform-other/portrait', backgroundLandscapeImageUrl: '/api/v1/public/welcome-designs/platform-other/landscape' } } };
    const a = welcomePresentation(settings,'a'), b = welcomePresentation(settings,'b'), inherited = welcomePresentation(settings,'c');
    expect(a.backgroundLandscapeImageUrl).toBeUndefined();
    expect(welcomeLandscapeUrl(welcomeBackgroundUrl(a), a.backgroundLandscapeImageUrl)).toContain('midnight-spice-landscape.webp');
    expect(welcomeBackgroundUrl(b)).toContain('platform-other/portrait');
    expect(welcomeLandscapeUrl(welcomeBackgroundUrl(b), b.backgroundLandscapeImageUrl)).toContain('platform-other/landscape');
    expect(welcomeLandscapeUrl(welcomeBackgroundUrl(inherited), inherited.backgroundLandscapeImageUrl)).toContain('platform-branch/landscape');
  });
  it('preserves legacy custom background URLs when no library id was chosen', () => {
    const legacy = welcomePresentation({ showHeritageArtwork: true, showPromoBanner: false, backgroundImageUrl: '/assets/custom-legacy.jpg' });
    expect(welcomeBackgroundUrl(legacy)).toBe('/assets/custom-legacy.jpg');
  });
  it('accepts scoped design settings and blocks unsafe images, huge libraries and invalid crops', () => {
    db.resetKioskConfiguration(); const config=KioskConfigurationRepository.snapshot();
    const welcome = { ...config.welcome, ...DEFAULT_WELCOME_PRESENTATION, deviceOverrides: { kioskA: { ...DEFAULT_WELCOME_PRESENTATION, restaurantName: 'My kiosk' } } };
    expect(kioskConfigurationSchema.safeParse({ ...config,welcome }).success).toBe(true);
    for (const change of [{ logoUrl: 'javascript:alert(1)' }, { backgroundFit: 'stretch' }, { backgroundZoom: 5 }, { backgroundPositionX: -2 }, { overlayOpacity: 1 }, { restaurantName: 'a'.repeat(161) }, { customBackgrounds: Array.from({length:4},()=>({id:'a',name:'A',imageUrl:'data:image/webp;base64,AAAA',width:1080,height:1920})) }]) expect(kioskConfigurationSchema.safeParse({ ...config,welcome:{...welcome,...change} }).success).toBe(false);
  });
  it('retains library and per-device data without allowing a remote payload reference to mutate local settings', () => {
    db.resetKioskConfiguration();
    const remote=KioskConfigurationRepository.snapshot(); remote.updatedAt=new Date(Date.now()+1000).toISOString();
    remote.welcome.deviceOverrides={kioskA:{ ...DEFAULT_WELCOME_PRESENTATION, headingText:'Hello' }};
    expect(KioskConfigurationRepository.apply(remote)).toBe(true);
    remote.welcome.deviceOverrides.kioskA.headingText='Mutated';
    expect(WelcomeScreenSettingsRepository.getSettings().deviceOverrides?.kioskA.headingText).toBe('Hello');
  });
  it('rejects file types and oversize originals before decoding or saving anything', async () => {
    await expect(optimizeWelcomeUpload(new File(['bad'], 'bad.svg', { type:'image/svg+xml' }))).rejects.toThrow(/PNG/);
    const file = new File(['x'], 'big.png', { type:'image/png' }); Object.defineProperty(file,'size',{value:13*1024*1024});
    await expect(optimizeWelcomeUpload(file)).rejects.toThrow(/12 MB/);
  });
});
describe('welcome image cache', () => {
  it('coalesces simultaneous downloads while giving each renderer its own blob URL', async () => {
    const cache = { match: vi.fn(async () => undefined), put: vi.fn(async () => undefined) };
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
    vi.stubGlobal('window', { location: { href: 'http://localhost/kiosk/', pathname: '/kiosk/' } });
    const fetcher = vi.fn(async () => new Response(new Blob(['picture'], { type: 'image/webp' }), { headers: { 'content-type': 'image/webp' } }));
    vi.stubGlobal('fetch', fetcher);
    const [first, second] = await Promise.all([WelcomeImageCache.source('/assets/branding/shared.webp'), WelcomeImageCache.source('/assets/branding/shared.webp')]);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(first).toMatch(/^blob:/); expect(second).toMatch(/^blob:/); expect(first).not.toBe(second);
    URL.revokeObjectURL(first); URL.revokeObjectURL(second);
  });
  it('keeps welcome assets separate from menu pruning, repairs HTML and serves cached blobs offline', async () => {
    let saved: Response | undefined = new Response('<html>',{headers:{'content-type':'text/html'}});
    const cache={match:vi.fn(async()=>saved),delete:vi.fn(async()=>{saved=undefined;return true;}),put:vi.fn(async(_url:string,response:Response)=>{saved=response;}),keys:vi.fn(async()=>[])};
    const storage={open:vi.fn(async()=>cache)};
    vi.stubGlobal('caches',storage); vi.stubGlobal('window',{location:{href:'http://localhost/kiosk/',pathname:'/kiosk/'}});
    const fetcher=vi.fn(async()=>new Response(new Blob(['picture'],{type:'image/webp'}),{headers:{'content-type':'image/webp'}})); vi.stubGlobal('fetch',fetcher);
    const first=await WelcomeImageCache.source(DEFAULT_KIOSK_WELCOME_BACKGROUND.imageUrl);
    expect(first).toMatch(/^blob:/); URL.revokeObjectURL(first);
    expect(cache.delete).toHaveBeenCalled(); expect(storage.open).toHaveBeenCalledWith('jamanvaar-welcome-background-v1');
    fetcher.mockRejectedValue(Error('offline'));
    const offline=await WelcomeImageCache.source(DEFAULT_KIOSK_WELCOME_BACKGROUND.imageUrl);
    expect(offline).toMatch(/^blob:/); URL.revokeObjectURL(offline); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('returns the safe source when network or cache is unavailable, and preserves data images without fetching', async () => {
    vi.stubGlobal('caches',undefined);
    expect(await WelcomeImageCache.source('/assets/branding/missing.webp')).toBe('/assets/branding/missing.webp');
    expect(await WelcomeImageCache.source('data:image/webp;base64,AAAA')).toBe('data:image/webp;base64,AAAA');
  });
});
describe('activation states', () => {
  const error=(message:string,status:number)=>Object.assign(new Error(message),{status});
  it.each([
    [error('db internals',500),'key','temporarily unavailable'], [error('Invalid',404),'restaurant','Restaurant not found'],
    [error('expired',400),'key','has expired'], [error('already used',409),'key','already been used'],
    [error('invalid token',403),'key','invalid'], [error('network fetch',0),'key','Cannot reach'],
    [error('rate limit',429),'key','Too many']
  ] as const)('formats %s safely', (err,stage,text)=>expect(kioskActivationError(err,stage)).toContain(text));
  it('explains offline activation without leaking the underlying error', () => expect(kioskActivationError(error('secret',500),'key',false)).toContain('offline'));
});

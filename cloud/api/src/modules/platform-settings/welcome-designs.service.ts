import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_WELCOME_POLICY, WELCOME_POLICY_KEY, WelcomePolicy } from './welcome-policy';
import builtins from './welcome-builtins.json';

const PREFIX = 'welcome.asset.';
const META_PREFIX = 'welcome.design.';
const photo = z.string().max(620000).regex(/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/);
const uploadSchema = z.object({ name: z.string().trim().min(1).max(80), category: z.string().trim().min(1).max(80), portrait: photo, landscape: photo.optional() }).strict();
type Design = { id: string; name: string; category: string; imageUrl: string; landscapeImageUrl: string; thumbnailUrl: string };
type StoredDesign = { id: string; name: string; category: string; portrait: string; landscape: string; thumbnail: string };

export function allowedWelcomeDesigns(designs: Design[], policy: WelcomePolicy, restaurantId: string): Design[] {
  const local = policy.restaurantAccess[restaurantId];
  return designs.filter(d => (policy.enabledIds === null || policy.enabledIds.includes(d.id)) && (!local || local.allowedIds === null || local.allowedIds.includes(d.id)))
    .slice(0, local?.maxDesigns ?? policy.maxDesigns);
}
/** Stored in the existing durable platform setting table; no local container filesystem uploads. */
@Injectable()
export class WelcomeDesignsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  async catalog() {
    const rows = await this.prisma.runAsPlatform(tx => tx.platformSetting.findMany({ where: { OR: [{ key: WELCOME_POLICY_KEY }, { key: { startsWith: META_PREFIX } }] }, orderBy: { createdAt: 'asc' } }));
    const policy = { ...DEFAULT_WELCOME_POLICY, ...((rows.find(r => r.key === WELCOME_POLICY_KEY)?.value || {}) as object) } as WelcomePolicy;
    const designs: Design[] = [...builtins, ...rows.filter(r => r.key.startsWith(META_PREFIX)).map(r => {
      const d = r.value as unknown as StoredDesign;
      const base = `/api/v1/public/welcome-designs/${d.id}`;
      return { id: d.id, name: d.name, category: d.category, imageUrl: `${base}/portrait`, landscapeImageUrl: `${base}/landscape`, thumbnailUrl: `${base}/thumbnail` };
    })];
    return { policy, designs };
  }
  async forRestaurant(restaurantId: string) {
    const { designs, policy } = await this.catalog();
    return { designs: allowedWelcomeDesigns(designs, policy, restaurantId), maxDesigns: policy.restaurantAccess[restaurantId]?.maxDesigns ?? policy.maxDesigns };
  }
  async validatePolicy(policy: WelcomePolicy) {
    const { designs } = await this.catalog(); const known = new Set(designs.map(d => d.id));
    for (const ids of [policy.enabledIds, ...Object.values(policy.restaurantAccess).map(a => a.allowedIds)]) {
      if (ids?.some(id => !known.has(id))) throw new BadRequestException('This policy includes an unknown welcome design. Refresh the collection.');
    }
    const ids = Object.keys(policy.restaurantAccess);
    if (ids.length) {
      const count = await this.prisma.runAsPlatform(tx => tx.restaurant.count({ where: { id: { in: ids } } }));
      if (count !== ids.length) throw new BadRequestException('Choose existing restaurants for design access overrides.');
    }
  }
  async add(raw: unknown, actor: PlatformUser) {
    const parsed = uploadSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message || 'Invalid welcome design.');
    const { name, category, portrait, landscape } = parsed.data;
    const optimize = async (data: string) => {
      const bytes = Buffer.from(data.split(',')[1], 'base64');
      if (bytes.length > 450 * 1024) throw new BadRequestException('Optimize images to 450 KB or less.');
      try {
        const image = sharp(bytes, { limitInputPixels: 1920 * 1920 }); const meta = await image.metadata();
        if (meta.format !== 'webp' || !meta.width || !meta.height || meta.width < 640 || meta.height < 640 || meta.width > 1920 || meta.height > 1920 || (meta.pages || 1) !== 1) throw Error('Invalid image dimensions or format.');
        // Decode and re-encode: magic bytes alone do not prove the payload is an image.
        const clean = await image.webp({ quality: 82 }).toBuffer();
        if (clean.length > 450 * 1024) throw Error('Image is too detailed.');
        return clean;
      } catch { throw new BadRequestException('Use a valid still WebP image, 640–1920 pixels on each side and under 450 KB.'); }
    };
    const p = await optimize(portrait), l = landscape ? await optimize(landscape) : p;
    const thumb = await sharp(l).resize(400, 225, { fit: 'cover' }).webp({ quality: 70 }).toBuffer();
    const data = (b: Buffer) => `data:image/webp;base64,${b.toString('base64')}`;
    const id = `platform-${randomUUID()}`;
    await this.prisma.runAsPlatform(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('welcome-design-catalog'))`;
      if (await tx.platformSetting.count({ where: { key: { startsWith: PREFIX } } }) >= 80) throw new BadRequestException('The platform collection supports up to 80 uploaded designs.');
      await tx.platformSetting.create({ data: { key: PREFIX + id, category: 'WELCOME_ASSETS', value: { id, name, category, portrait: data(p), landscape: data(l), thumbnail: data(thumb) }, updatedBy: actor.id } });
      await tx.platformSetting.create({ data: { key: META_PREFIX + id, category: 'WELCOME_ASSETS', value: { id, name, category }, updatedBy: actor.id } });
      await this.audit.log({ actorType: 'PLATFORM', actorId: actor.id, action: 'WELCOME_DESIGN_ADDED', category: 'CATALOG', details: { id, name, category } }, tx);
    });
    return { id };
  }
  async image(id: string, variant: string) {
    if (!/^platform-[0-9a-f-]{36}$/.test(id) || !['portrait', 'landscape', 'thumbnail'].includes(variant)) throw new NotFoundException();
    const row = await this.prisma.runAsPlatform(tx => tx.platformSetting.findUnique({ where: { key: PREFIX + id } }));
    if (!row) throw new NotFoundException();
    const value = row.value as unknown as StoredDesign;
    return Buffer.from(value[variant as 'portrait' | 'landscape' | 'thumbnail'].split(',')[1], 'base64');
  }
  /** Changing access never blanks a running kiosk. Existing selections may keep their exact URLs. */
  validateSelection(welcome: any, previous: any, designs: Design[]) {
    const allowed = new Map(designs.map(d => [d.id, d]));
    const allBuiltins = new Map(builtins.flatMap(d => [[d.imageUrl, d.id], [d.landscapeImageUrl, d.id], [d.thumbnailUrl, d.id]]));
    const designId = (v: any) => v?.backgroundId || allBuiltins.get(v?.backgroundImageUrl) || (/\/welcome-designs\/(platform-[^/]+)\//.exec(v?.backgroundImageUrl || '')?.[1]);
    const check = (next: any, prior: any) => {
      const id = designId(next);
      if (!id || welcome.customBackgrounds?.some((d: any) => d.id === id)) return;
      const selected = allowed.get(id);
      if (!selected) {
        if (id === designId(prior) && next.backgroundImageUrl === prior.backgroundImageUrl && next.backgroundLandscapeImageUrl === prior.backgroundLandscapeImageUrl) return;
        throw new BadRequestException('This welcome design is not available for this restaurant. Refresh the collection or ask Super Admin.');
      }
      // Persist canonical URLs with the selection so platform uploads work offline without a catalog lookup.
      if (id.startsWith('platform-')) { next.backgroundImageUrl = selected.imageUrl; next.backgroundLandscapeImageUrl = selected.landscapeImageUrl; }
      else { next.backgroundId = id; delete next.backgroundImageUrl; delete next.backgroundLandscapeImageUrl; }
    };
    check(welcome, previous);
    for (const [id, value] of Object.entries(welcome.deviceOverrides || {})) check(value, previous?.deviceOverrides?.[id]);
  }
}

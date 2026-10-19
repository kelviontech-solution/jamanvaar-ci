import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { randomBytes, createHash } from 'node:crypto';
import { QrOperationsService } from './qr-operations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeBus } from '../../common/realtime/realtime-bus';
import { parseInlineImage, publicImageUrl } from '../menu-publications/menu-snapshot';
import { QrMenuService } from './qr-menu.service';
import { QrSettingsService } from './qr-settings.service';
import { restaurantPageSchema, RestaurantPageInput, PageCopyInput, websiteQrPrintDesignSchema, WebsiteQrPrintDesign } from './qr-restaurant-page.schema';
import { ConfigService } from '@nestjs/config';
import { restaurantPageHead } from './qr-page-metadata';
const DRAFT = 'QR_RESTAURANT_PAGE',
  PUBLIC = 'QR_PAGE_PUBLIC',
  HISTORY = 'QR_PAGE_HISTORY',
  LINK = 'QR_PAGE_LINK', PRINT_DESIGN = 'QR_PAGE_PRINT_DESIGN';
type Scope = { restaurantId: string; key: string; branchId: string | null; actorId: string };
const empty: RestaurantPageInput = {
  businessHours:null,
  seo:{title:'',description:'',imageUrl:''},
  translations: {},
  defaultLanguage: 'en',
  noticeStart: '',
  noticeEnd: '',
  engagementEnabled: false,
  heroPositionX: 50,
  enabled: false,
  entryMode: 'MENU',
  template: 'HERITAGE',
  title: '',
  tagline: '',
  welcome: '',
  about: '',
  accent: '#A84816',
  logoUrl: '',
  heroUrl: '',
  heroPosition: 50,
  gallery: [],
  featuredItemIds: [],
  sections: ['FEATURED', 'ABOUT', 'GALLERY', 'VISIT'],
  phone: '',
  whatsapp: '',
  instagram: '',
  mapsUrl: '',
  reviewUrl: '',
  address: '',
  hours: '',
  notice: '',
  footer: '',
  testimonials: [],
  press: []
};
@Injectable()
export class QrRestaurantPageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ApplicationEntitlementsService,
    private readonly audit: AuditService,
    private readonly bus: RealtimeBus,
    private readonly menus: QrMenuService,
    private readonly config: ConfigService,
    private readonly operations: QrOperationsService,
    private readonly settings: QrSettingsService
  ) {}
  private where(rid: string, type: string, key: string) {
    return { restaurantId_entityType_externalId: { restaurantId: rid, entityType: type, externalId: key } };
  }
  /**
   * `jamanvaar-demo-restaurant-aB3xY9kq` instead of a bare random token: a guest or owner reading
   * the URL (on a printed card, in a WhatsApp share, in browser history) can tell what it is before
   * opening it. The random suffix is still the actual uniqueness guarantee -- two restaurants with
   * the same name collide on the readable prefix constantly, never on the suffix -- so a name with
   * no safe characters at all (emoji-only, etc.) degrades to the suffix alone rather than failing.
   */
  private publicSlug(name: string) {
    const base = name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    return (base ? base + '-' : '') + randomBytes(6).toString('base64url');
  }
  private async scope(user: User, key: string) {
    if (!['OWNER', 'MANAGER'].includes(user.role)) throw new ForbiddenException('Owner or branch manager access is required');
    if (key === 'restaurant' && user.role !== 'OWNER') throw new ForbiddenException('Only the owner may edit restaurant-wide content');
    const branchId = key === 'restaurant' ? null : key;
    if (branchId && user.role !== 'OWNER' && user.branchId !== branchId) throw new ForbiddenException('Choose your assigned branch');
    await this.prisma.runAsTenant(user.restaurantId, async (tx) => {
      if (branchId && !(await tx.branch.findFirst({ where: { id: branchId, restaurantId: user.restaurantId, status: 'ACTIVE' } })))
        throw new ForbiddenException('Branch is not available');
      await this.access.assertAppEnabled(tx, user.restaurantId, 'QR_ORDERING', branchId);
    });
    return { restaurantId: user.restaurantId, key, branchId, actorId: user.id };
  }
  private async lock(tx: Prisma.TransactionClient, rid: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + rid}))`;
  }
  private async content(tx: Prisma.TransactionClient, rid: string, key: string) {
    const own = await tx.syncedEntity.findUnique({ where: this.where(rid, PUBLIC, key) });
    const row = own ?? (key !== 'restaurant' ? await tx.syncedEntity.findUnique({ where: this.where(rid, PUBLIC, 'restaurant') }) : null);
    return { row, source: own ? key : 'restaurant', content: row ? restaurantPageSchema.parse((row.payload as any).content) : undefined };
  }
  async editor(user: User, key = 'restaurant') {
    const s = await this.scope(user, key);
    const menu = await this.menus.build(s.restaurantId, s.branchId);
    return this.prisma.runAsTenant(s.restaurantId, async (tx) => {
      const draft = await tx.syncedEntity.findUnique({ where: this.where(s.restaurantId, DRAFT, key) }),
        published = await this.content(tx, s.restaurantId, key);
      const capability = await this.access.resolveQrCapability(tx, s.restaurantId, 'QR_RESTAURANT_PAGE', s.branchId);
      const restaurant = await tx.restaurant.findUniqueOrThrow({ where: { id: s.restaurantId }, select: { name: true, address: true, currency: true } });
      const branches = await tx.branch.findMany({
        where: { restaurantId: s.restaurantId, status: 'ACTIVE', ...(user.role === 'OWNER' ? {} : { id: user.branchId ?? 'none' }) },
        select: { id: true, name: true, address: true },
        orderBy: { name: 'asc' }
      });
      const selected = branches.find((b) => b.id === s.branchId);
      const ownPages = await tx.syncedEntity.findMany({
        where: { restaurantId: s.restaurantId, entityType: PUBLIC, externalId: { in: branches.map((b) => b.id) } },
        select: { externalId: true }
      });
      const affectedBranches =
        key === 'restaurant'
          ? await Promise.all(
              branches
                .filter((b) => !ownPages.some((p) => p.externalId === b.id))
                .map(async (b) => ({
                  id: b.id,
                  name: b.name,
                  licensed: (await this.access.resolveQrCapability(tx, s.restaurantId, 'QR_RESTAURANT_PAGE', b.id)).enabled
                }))
            )
          : [];
      const link = await tx.syncedEntity.findUnique({ where: this.where(s.restaurantId, LINK, key) });
      const history = await tx.syncedEntity.findMany({
        where: { restaurantId: s.restaurantId, entityType: HISTORY, payload: { path: ['scope'], equals: key } },
        orderBy: { createdAt: 'desc' },
        take: 20
      });
      return {
        scope: key,
        canEditGlobal: user.role === 'OWNER',
        version: draft?.syncVersion ?? 0,
        draft: restaurantPageSchema.parse((draft?.payload as any)?.content ?? published.content ?? empty),
        published: published.content ?? null,
        inherited: published.source !== key,
        publishedAt: (published.row?.payload as any)?.publishedAt ?? null,
        capability,
        restaurantName: restaurant.name,
        branchName: selected?.name ?? 'All branches',
        currency: restaurant.currency,
        defaultAddress: selected?.address ?? (s.branchId ? restaurant.address : '') ?? '',
        branches,
        affectedBranches,
        sharePath: link ? '/q/site/' + (link.payload as any).slug : null,
        shareUrl: link ? this.shareUrl((link.payload as any).slug) : null,
        orderOnlineUrl: await this.orderOnlineUrl(tx, s.restaurantId, s.branchId),
        items: menu.items,
        categories: menu.categories,
        menuReady: menu.ready,
        history: history.map((r) => ({
          id: r.externalId,
          at: r.createdAt,
          title: (r.payload as any).content?.title,
          template: (r.payload as any).content?.template
        }))
      };
    });
  }
  private publicBase(): string | null {
    const base =
      this.config.get<string>('QR_ORDER_BASE_URL')?.trim().replace(/\/+$/, '') || (this.config.get('NODE_ENV') === 'production' ? '' : 'http://localhost:5190');
    try {
      const url = new URL(base);
      if (
        url.username ||
        url.password ||
        !['https:', 'http:'].includes(url.protocol) ||
        (this.config.get('NODE_ENV') === 'production' && url.protocol !== 'https:')
      )
        return null;
      return base;
    } catch {
      return null;
    }
  }
  private shareUrl(slug: string) {
    const base = this.publicBase();
    return base ? base + '/q/site/' + slug : null;
  }
  /**
   * The business page's "Order online" button needs somewhere real to send a guest -- this
   * finds the branch's own menu-only code (no table, guest picks dine-in/takeaway themselves)
   * rather than inventing a second ordering surface. Restaurant-wide scope (branchId null) has
   * no single branch to point at, same reasoning as the page itself having none of its own.
   */
  private async orderOnlineUrl(tx: Prisma.TransactionClient, restaurantId: string, branchId: string | null) {
    const base = branchId && this.publicBase();
    if (!base) return null;
    const code = await tx.qrCode.findFirst({
      where: { restaurantId, branchId, mode: 'MENU_ONLY', status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { publicToken: true }
    });
    return code ? base + '/q/' + code.publicToken : null;
  }
  /**
   * A printable poster for the restaurant's own public page -- a distinct QR destination from any table
   * code, so it is generated from the page's own stable share link, not a `QrCode` row. Only a published,
   * enabled branch page has a real address to print; a restaurant-wide scope has no page of its own (see
   * `editor` above), so the caller must pick the actual branch, the same choice the editor's own branch
   * picker already makes them take before sharing a link.
   */
  private async websiteDesign(tx:Prisma.TransactionClient,rid:string,key:string,accent='#0B253A') {
    const row=await tx.syncedEntity.findUnique({where:this.where(rid,PRINT_DESIGN,key)});
    const design=websiteQrPrintDesignSchema.parse((row?.payload as any)?.design??{template:'website',accent,instruction:'Scan to visit our restaurant',footer:'Menu · Story · Contact',showLogo:true,layout:'CARD'});
    return {version:row?.syncVersion??0,design};
  }
  async printDesign(user:User,key:string) {
    if(key==='restaurant')throw new BadRequestException('Choose the branch whose restaurant page QR you want to design.');
    const s=await this.scope(user,key);
    return this.prisma.runAsTenant(s.restaurantId,async tx=>{
      await this.access.assertQrCapability(tx,s.restaurantId,'QR_RESTAURANT_PAGE',s.branchId);
      const page=await this.content(tx,s.restaurantId,key);
      return this.websiteDesign(tx,s.restaurantId,key,page.content?.accent);
    });
  }
  async savePrintDesign(user:User,key:string,version:number,input:WebsiteQrPrintDesign) {
    if(key==='restaurant')throw new BadRequestException('Choose a branch before saving its restaurant page QR design.');
    const s=await this.scope(user,key),design=websiteQrPrintDesignSchema.parse(input);
    return this.prisma.runAsTenant(s.restaurantId,async tx=>{
      await this.lock(tx,s.restaurantId);
      await this.access.assertQrCapability(tx,s.restaurantId,'QR_RESTAURANT_PAGE',s.branchId);
      const current=await tx.syncedEntity.findUnique({where:this.where(s.restaurantId,PRINT_DESIGN,key)});
      if((current?.syncVersion??0)!==version)throw new ConflictException('This QR design changed. Reload before saving.');
      const row=await tx.syncedEntity.upsert({where:this.where(s.restaurantId,PRINT_DESIGN,key),create:{restaurantId:s.restaurantId,entityType:PRINT_DESIGN,externalId:key,payload:{design}},update:{payload:{design},syncVersion:{increment:1}}});
      await this.log(tx,s,'QR_PAGE_PRINT_DESIGN_UPDATED');
      return {version:row.syncVersion,design};
    });
  }
  async printData(user: User, key: string) {
    if (key === 'restaurant') throw new BadRequestException('Choose a specific branch to generate its website QR poster.');
    const s = await this.scope(user, key);
    return this.prisma.runAsTenant(s.restaurantId, async (tx) => {
      const capability = await this.access.resolveQrCapability(tx, s.restaurantId, 'QR_RESTAURANT_PAGE', s.branchId);
      if (!capability.enabled) throw new ConflictException('Business page is not included for this branch.');
      const published = await this.content(tx, s.restaurantId, key);
      if (!published.content?.enabled) throw new ConflictException('Publish and enable the business page before generating its QR poster.');
      const link = await tx.syncedEntity.findUnique({ where: this.where(s.restaurantId, LINK, key) });
      const url = link ? this.shareUrl((link.payload as any).slug) : null;
      if (!url) throw new ConflictException('The public website address is not configured yet. Ask your platform administrator.');
      const restaurant = await tx.restaurant.findUniqueOrThrow({ where: { id: s.restaurantId }, select: { name: true } });
      const branch = await tx.branch.findFirst({ where: { id: s.branchId!, restaurantId: s.restaurantId }, select: { name: true } });
      const branding = await this.settings.branding(s.restaurantId);
      const accent = /^#[0-9a-f]{6}$/i.test(published.content.accent) ? published.content.accent : '#0B253A';
      const configured=await this.websiteDesign(tx,s.restaurantId,key,accent);
      return {
        restaurantName: restaurant.name,
        branchName: branch?.name ?? null,
        tableLabel: 'VISIT OUR WEBSITE',
        url,
        tagline: published.content.tagline || 'Menu · Story · Contact',
        logoUrl: publicImageUrl(published.content.logoUrl)||branding.logoUrl,
        design: configured.design
      };
    });
  }
  async save(user: User, key: string, version: number, input: RestaurantPageInput) {
    const s = await this.scope(user, key),
      parsed = restaurantPageSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; '));
    const out = await this.prisma.runAsTenant(s.restaurantId, async (tx) => {
      await this.lock(tx, s.restaurantId);
      await this.access.assertQrCapability(tx, s.restaurantId, 'QR_RESTAURANT_PAGE', s.branchId);
      const current = await tx.syncedEntity.findUnique({ where: this.where(s.restaurantId, DRAFT, key) });
      if ((current?.syncVersion ?? 0) !== version) throw new ConflictException('This draft changed. Reload before saving.');
      const hashes = [parsed.data.logoUrl, parsed.data.heroUrl, parsed.data.seo.imageUrl, ...parsed.data.gallery.map((i) => i.url)].filter(Boolean).map((v) => v.slice(4));
      if (hashes.length) {
        const owned = await tx.menuImage.count({ where: { restaurantId: s.restaurantId, hash: { in: [...new Set(hashes)] } } });
        if (owned !== new Set(hashes).size) throw new BadRequestException('Upload images to this restaurant before using them');
      }
      await tx.syncedEntity.upsert({
        where: this.where(s.restaurantId, DRAFT, key),
        create: { restaurantId: s.restaurantId, entityType: DRAFT, externalId: key, payload: { content: parsed.data, scope: key } },
        update: { payload: { content: parsed.data, scope: key }, syncVersion: { increment: 1 } }
      });
      await this.log(tx, s, 'QR_PAGE_DRAFT_SAVED');
      return { version: version + 1 };
    });
    return out;
  }
  async publish(user: User, key: string, version: number) {
    const s = await this.scope(user, key);
    await this.prisma.runAsTenant(s.restaurantId, async (tx) => {
      await this.lock(tx, s.restaurantId);
      await this.access.assertQrCapability(tx, s.restaurantId, 'QR_RESTAURANT_PAGE', s.branchId);
      const draft = await tx.syncedEntity.findUnique({ where: this.where(s.restaurantId, DRAFT, key) });
      if (!draft || draft.syncVersion !== version) throw new ConflictException('Save and review the current draft before publishing');
      const content = restaurantPageSchema.parse((draft.payload as any).content);
      if (content.enabled && (!content.title || !content.welcome))
        throw new BadRequestException('Add a page heading and welcome message before publishing');
      const old = await tx.syncedEntity.findUnique({ where: this.where(s.restaurantId, PUBLIC, key) });
      if (old)
        await tx.syncedEntity.create({
          data: {
            restaurantId: s.restaurantId,
            entityType: HISTORY,
            externalId: key + ':' + randomBytes(12).toString('hex'),
            payload: { ...(old.payload as object), scope: key }
          }
        });
      const payload = { scope: key, content, publishedAt: new Date().toISOString(), draftVersion: version };
      await tx.syncedEntity.upsert({
        where: this.where(s.restaurantId, PUBLIC, key),
        create: { restaurantId: s.restaurantId, entityType: PUBLIC, externalId: key, payload },
        update: { payload, syncVersion: { increment: 1 } }
      });
      const targets = s.branchId
        ? [s.branchId]
        : (await tx.branch.findMany({ where: { restaurantId: s.restaurantId, status: 'ACTIVE' }, select: { id: true } })).map((b) => b.id);
      let restaurantName: string | null = null;
      for (const branchId of targets) {
        const where = this.where(s.restaurantId, LINK, branchId);
        if (!(await tx.syncedEntity.findUnique({ where }))) {
          restaurantName ??= (await tx.restaurant.findUniqueOrThrow({ where: { id: s.restaurantId }, select: { name: true } })).name;
          await tx.syncedEntity.create({
            data: { restaurantId: s.restaurantId, entityType: LINK, externalId: branchId, payload: { slug: this.publicSlug(restaurantName), branchId } }
          });
        }
      }
      // Bump the draft to prevent a stale preview or second editor publishing silently.
      await tx.syncedEntity.update({ where: { id: draft.id }, data: { syncVersion: { increment: 1 } } });
      await this.log(tx, s, 'QR_PAGE_PUBLISHED');
    });
    this.bus.publishInvalidation(s.restaurantId);
    return this.editor(user, key);
  }
  async inherit(user: User, key: string, version: number) {
    const s = await this.scope(user, key);
    if (!s.branchId) throw new BadRequestException('Select a branch to use restaurant defaults');
    await this.prisma.runAsTenant(s.restaurantId, async (tx) => {
      await this.lock(tx, s.restaurantId);
      const row = await tx.syncedEntity.findUnique({ where: this.where(s.restaurantId, DRAFT, key) });
      if ((row?.syncVersion ?? 0) !== version) throw new ConflictException('Reload this draft before changing inheritance');
      const old = await tx.syncedEntity.findUnique({ where: this.where(s.restaurantId, PUBLIC, key) });
      if (old)
        await tx.syncedEntity.create({
          data: {
            restaurantId: s.restaurantId,
            entityType: HISTORY,
            externalId: key + ':' + randomBytes(12).toString('hex'),
            payload: { ...(old.payload as object), scope: key }
          }
        });
      await tx.syncedEntity.deleteMany({ where: { restaurantId: s.restaurantId, entityType: PUBLIC, externalId: key } });
      const inherited = await this.content(tx, s.restaurantId, 'restaurant');
      await tx.syncedEntity.upsert({
        where: this.where(s.restaurantId, DRAFT, key),
        create: { restaurantId: s.restaurantId, entityType: DRAFT, externalId: key, payload: { scope: key, content: inherited.content ?? empty } },
        update: { payload: { scope: key, content: inherited.content ?? empty }, syncVersion: { increment: 1 } }
      });
      await this.log(tx, s, 'QR_PAGE_INHERIT_RESTAURANT');
    });
    this.bus.publishInvalidation(s.restaurantId);
    return this.editor(user, key);
  }
  async restoreDraft(user: User, key: string, version: number, id: string) {
    const s = await this.scope(user, key);
    const record = await this.prisma.runAsTenant(s.restaurantId, (tx) => tx.syncedEntity.findUnique({ where: this.where(s.restaurantId, HISTORY, id) }));
    if (!record || (record.payload as any).scope !== key) throw new NotFoundException('Saved version not found in this scope');
    await this.save(user, key, version, (record.payload as any).content);
    return this.editor(user, key);
  }
  async upload(user: User, key: string, data: string) {
    const s = await this.scope(user, key),
      image = parseInlineImage(data);
    if ('error' in image) throw new BadRequestException(image.error);
    return this.prisma.runAsTenant(s.restaurantId, async (tx) => {
      await this.access.assertQrCapability(tx, s.restaurantId, 'QR_RESTAURANT_PAGE', s.branchId);
      await tx.menuImage.upsert({
        where: { restaurantId_hash: { restaurantId: s.restaurantId, hash: image.image.hash } },
        create: {
          restaurantId: s.restaurantId,
          hash: image.image.hash,
          contentType: image.image.contentType,
          size: image.image.data.length,
          data: image.image.data
        },
        update: {}
      });
      return { ref: 'img:' + image.image.hash, url: publicImageUrl('img:' + image.image.hash) };
    });
  }
  private async copyPlan(tx: Prisma.TransactionClient, s: Scope, input: PageCopyInput) {
    const source = await tx.syncedEntity.findUnique({ where: this.where(s.restaurantId, DRAFT, s.key) });
    if (!source || source.syncVersion !== input.version) throw new ConflictException('Save the current source draft before copying');
    await this.access.assertQrCapability(tx, s.restaurantId, 'QR_RESTAURANT_PAGE', s.branchId);
    const content = restaurantPageSchema.parse((source.payload as any).content);
    const groups: Record<PageCopyInput['groups'][number], (keyof RestaurantPageInput)[]> = {
      DESIGN: ['template', 'accent', 'sections'],
      STORY: ['title', 'tagline', 'welcome', 'about', 'footer', 'translations', 'defaultLanguage', 'notice', 'noticeStart', 'noticeEnd', 'testimonials', 'press', 'seo'],
      PHOTOS: ['logoUrl', 'heroUrl', 'heroPosition', 'heroPositionX', 'gallery'],
      CONTACT: ['address', 'hours', 'businessHours', 'phone', 'whatsapp', 'instagram', 'mapsUrl', 'reviewUrl'],
      BEHAVIOUR: ['enabled', 'entryMode', 'engagementEnabled', 'featuredItemIds']
    };
    const baseFields = input.groups.flatMap((g) => groups[g]);
    const rows = [];
    for (const id of input.targets) {
      const fields = [...baseFields];
      if (id === s.key) throw new BadRequestException('Choose another branch as the target');
      const branch = await tx.branch.findFirst({ where: { id, restaurantId: s.restaurantId, status: 'ACTIVE' } });
      if (!branch) throw new ForbiddenException('Target branch is outside this restaurant');
      await this.access.assertQrCapability(tx, s.restaurantId, 'QR_RESTAURANT_PAGE', id);
      const draft = await tx.syncedEntity.findUnique({ where: this.where(s.restaurantId, DRAFT, id) });
      const published = await this.content(tx, s.restaurantId, id);
      const before = restaurantPageSchema.parse((draft?.payload as any)?.content ?? published.content ?? empty);
      const next = { ...before };
      for (const field of fields) (next as Record<string, unknown>)[field] = content[field];
      // Translated hours are branch contact data too; STORY must not overwrite them silently.
      const languages = Object.keys({ ...before.translations, ...content.translations }) as Array<keyof RestaurantPageInput['translations']>;
      if (input.groups.includes('STORY') && !input.groups.includes('CONTACT'))
        next.translations = Object.fromEntries(
          languages.map((lang) => [lang, { ...content.translations[lang], hours: before.translations[lang]?.hours || '' }])
        );
      if (input.groups.includes('CONTACT') && !input.groups.includes('STORY'))
        next.translations = Object.fromEntries(
          languages.map((lang) => [lang, { ...before.translations[lang], hours: content.translations[lang]?.hours || '' }])
        );
      if (!fields.includes('translations') && JSON.stringify(next.translations) !== JSON.stringify(before.translations)) fields.push('translations');
      rows.push({
        id,
        name: branch.name,
        version: draft?.syncVersion ?? 0,
        before,
        next,
        changes: fields
          .filter((f) => JSON.stringify(before[f]) !== JSON.stringify(next[f]))
          .map((field) => ({ field, before: before[field], after: next[field] }))
      });
    }
    const checksum = createHash('sha256')
      .update(JSON.stringify({ source: content, scope: s.key, input, rows }))
      .digest('hex');
    return { rows, checksum };
  }
  async copy(user: User, key: string, input: PageCopyInput, checksum?: string) {
    const s = await this.scope(user, key);
    if (user.role !== 'OWNER') throw new ForbiddenException('Only the owner can copy across branches');
    return this.prisma.runAsTenant(s.restaurantId, async (tx) => {
      await this.lock(tx, s.restaurantId);
      const plan = await this.copyPlan(tx, s, input);
      if (!checksum) return { checksum: plan.checksum, branches: plan.rows.map(({ id, name, version, changes }) => ({ id, name, version, changes })) };
      if (plan.checksum !== checksum) throw new ConflictException('Source or target drafts changed. Review the branch copy again.');
      for (const row of plan.rows) {
        await tx.syncedEntity.upsert({
          where: this.where(s.restaurantId, DRAFT, row.id),
          create: { restaurantId: s.restaurantId, entityType: DRAFT, externalId: row.id, payload: { scope: row.id, content: row.next } },
          update: { payload: { scope: row.id, content: row.next }, syncVersion: { increment: 1 } }
        });
      }
      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: user.id,
          restaurantId: s.restaurantId,
          action: 'QR_PAGE_BRANCH_DRAFTS_COPIED',
          category: 'QR_ORDERING',
          details: { source: key, targets: input.targets, groups: input.groups }
        },
        tx
      );
      return { copied: plan.rows.length, draftOnly: true };
    });
  }
  async launch(user: User, key: string) {
    const s = await this.scope(user, key);
    const [health, page] = await Promise.all([this.operations.healthForScope(s.restaurantId, s.branchId), this.editor(user, key)]);
    const details = await this.prisma.runAsTenant(s.restaurantId, async (tx) => {
      const record = await tx.syncedEntity.findUnique({ where: this.where(s.restaurantId, 'QR_PAGE_LAUNCH', key) });
      const orders = s.branchId
        ? await tx.syncedOrder.findMany({
            where: {
              restaurantId: s.restaurantId,
              branchId: s.branchId,
              source: 'QR',
              status: { not: 'CANCELLED' },
              ...(page.publishedAt ? { createdAt: { gte: new Date(page.publishedAt) } } : {})
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { externalOrderId: true, createdAt: true, meta: true }
          })
        : [];
      return {
        test: record?.payload ?? null,
        recentOrders: orders.map((o) => ({ id: o.externalOrderId, at: o.createdAt, token: (o.meta as any)?.tokenNumber || o.externalOrderId }))
      };
    });
    return {
      health,
      ...details,
      pageEnabled: page.published?.enabled === true,
      currentPublication: page.publishedAt,
      testCurrent: page.published?.enabled === true && !!page.publishedAt && (details.test as any)?.publishedAt === page.publishedAt,
      branchRequired: !s.branchId
    };
  }
  async recordLaunch(user: User, key: string, input: { orderId: string; scanned: boolean; kitchenReceived: boolean }) {
    const s = await this.scope(user, key);
    if (!s.branchId) throw new BadRequestException('Select a branch to record its test scan');
    await this.prisma.runAsTenant(s.restaurantId, async (tx) => {
      await this.lock(tx, s.restaurantId);
      await this.access.assertQrCapability(tx, s.restaurantId, 'QR_RESTAURANT_PAGE', s.branchId);
      const published = await this.content(tx, s.restaurantId, key),
        at = (published.row?.payload as any)?.publishedAt;
      if (!at || !published.content?.enabled || !input.scanned || !input.kitchenReceived)
        throw new BadRequestException('Publish the page, scan its table QR and confirm kitchen receipt first');
      const order = await tx.syncedOrder.findFirst({
        where: {
          restaurantId: s.restaurantId,
          branchId: s.branchId!,
          externalOrderId: input.orderId,
          source: 'QR',
          status: { not: 'CANCELLED' },
          createdAt: { gte: new Date(at) }
        }
      });
      if (!order) throw new BadRequestException('Choose a non-cancelled QR order created in this branch after page publication');
      const payload = {
        publishedAt: at,
        orderId: order.externalOrderId,
        scanned: true,
        kitchenReceived: true,
        attestedBy: user.id,
        at: new Date().toISOString()
      };
      await tx.syncedEntity.upsert({
        where: this.where(s.restaurantId, 'QR_PAGE_LAUNCH', key),
        create: { restaurantId: s.restaurantId, entityType: 'QR_PAGE_LAUNCH', externalId: key, payload },
        update: { payload, syncVersion: { increment: 1 } }
      });
      await this.log(tx, s, 'QR_PAGE_LAUNCH_ATTESTED');
    });
    return this.launch(user, key);
  }
  async engagement(user: User, key: string) {
    const s = await this.scope(user, key);
    return this.prisma.runAsTenant(s.restaurantId, async (tx) => {
      await this.access.assertQrCapability(tx, s.restaurantId, 'QR_RESTAURANT_PAGE', s.branchId);
      const since = new Date(Date.now() - 30 * 86400000);
      const rows = await tx.qrEvent.groupBy({
        by: ['type'],
        where: { restaurantId: s.restaurantId, ...(s.branchId ? { branchId: s.branchId } : {}), type: { startsWith: 'QR_PAGE_' }, createdAt: { gte: since } },
        _count: { _all: true }
      });
      return {
        since: since.toISOString(),
        counts: Object.fromEntries(rows.map((r) => [r.type.replace('QR_PAGE_', ''), r._count._all])),
        description: 'Action counts, not unique people, completed orders or submitted Google reviews. No customer identity is collected.'
      };
    });
  }
  async track(slug: string, type: string) {
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(slug)) throw new NotFoundException('Business page not found');
    const row = await this.prisma.runAsPlatform((tx) =>
      tx.syncedEntity.findFirst({ where: { entityType: LINK, payload: { path: ['slug'], equals: slug } }, select: { restaurantId: true, payload: true } })
    );
    if (!row) throw new NotFoundException('Business page not found');
    const branchId = (row.payload as any).branchId as string;
    const active = await this.prisma.runAsPlatform((tx) =>
      tx.branch.findFirst({
        where: { id: branchId, restaurantId: row.restaurantId, status: 'ACTIVE', restaurant: { status: 'ACTIVE', deletedAt: null } },
        select: { id: true }
      })
    );
    if (!active) throw new NotFoundException('Business page unavailable');
    const page = await this.publicPage(row.restaurantId, branchId);
    if (!page?.content.engagementEnabled) return { recorded: false };
    await this.prisma.runAsTenant(row.restaurantId, async (tx) => {
      await tx.qrEvent.create({ data: { restaurantId: row.restaurantId, branchId, type: 'QR_PAGE_' + type } });
      // Only anonymous aggregate-action rows belong to this retention policy.
      await tx.qrEvent.deleteMany({
        where: { restaurantId: row.restaurantId, type: { startsWith: 'QR_PAGE_' }, createdAt: { lt: new Date(Date.now() - 90 * 86400000) } }
      });
    });
    return { recorded: true };
  }
  private log(tx: Prisma.TransactionClient, s: Scope, action: string) {
    return this.audit.log(
      { actorType: 'TENANT', actorId: s.actorId, restaurantId: s.restaurantId, action, category: 'QR_ORDERING', details: { scope: s.key } },
      tx
    );
  }
  async publicPage(rid: string, branchId: string) {
    return this.prisma.runAsTenant(rid, async (tx) => {
      if (!(await this.access.resolveQrCapability(tx, rid, 'QR_RESTAURANT_PAGE', branchId)).enabled) return null;
      const result = await this.content(tx, rid, branchId);
      if (!result.content?.enabled) return null;
      const c = result.content,
        branch = await tx.branch.findFirst({ where: { id: branchId, restaurantId: rid, status: 'ACTIVE' }, select: { address: true } });
      const link = await tx.syncedEntity.findUnique({ where: this.where(rid, LINK, branchId) });
      const noticeActive = (!c.noticeStart || Date.now() >= Date.parse(c.noticeStart)) && (!c.noticeEnd || Date.now() < Date.parse(c.noticeEnd));
      return {
        trackingSlug: c.engagementEnabled && link ? ((link.payload as any).slug as string) : null,
        orderOnlineUrl: await this.orderOnlineUrl(tx, rid, branchId),
        content: {
          ...c,
          notice: noticeActive ? c.notice : '',
          translations: Object.fromEntries(
            Object.entries(c.translations).map(([lang, value]) => [lang, { ...value, ...(!noticeActive ? { notice: '' } : {}) }])
          ),
          address: c.address || branch?.address || '',
          logoUrl: publicImageUrl(c.logoUrl) || '',
          heroUrl: publicImageUrl(c.heroUrl) || '',
          seo:{...c.seo,imageUrl:publicImageUrl(c.seo.imageUrl)||''},
          gallery: c.gallery.map((i) => ({ ...i, url: publicImageUrl(i.url) || '' }))
        },
        publishedAt: (result.row!.payload as any).publishedAt
      };
    });
  }
  /**
   * Shared by `site()` and anything else a business-page visitor reaches by slug (reservations,
   * eventually others) -- one place resolving a public slug to the tenant it belongs to, rather
   * than each caller re-deriving restaurantId/branchId from the LINK row itself.
   */
  async resolveSlug(slug: string) {
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(slug)) throw new NotFoundException('Business page not found');
    const link = await this.prisma.runAsPlatform((tx) =>
      tx.syncedEntity.findFirst({ where: { entityType: LINK, payload: { path: ['slug'], equals: slug } }, select: { restaurantId: true, payload: true } })
    );
    if (!link) throw new NotFoundException('Business page not found');
    const branchId = (link.payload as any).branchId as string;
    const [restaurant, branch] = await this.prisma.runAsPlatform((tx) =>
      Promise.all([
        tx.restaurant.findFirst({ where: { id: link.restaurantId, status: 'ACTIVE', deletedAt: null }, select: { name: true, currency: true } }),
        tx.branch.findFirst({ where: { id: branchId, restaurantId: link.restaurantId, status: 'ACTIVE' }, select: { name: true } })
      ])
    );
    if (!restaurant || !branch) throw new NotFoundException('Business page is unavailable');
    return { restaurantId: link.restaurantId, branchId, restaurantName: restaurant.name, branchName: branch.name, currency: restaurant.currency };
  }
  /**
   * Only worth showing once there is a second branch to choose between -- a single-branch
   * restaurant already has its own address in the Visit section, so a one-item "locations" list
   * would just repeat it. Each branch's own address/hours/phone come from its own published page
   * when it has one (falling back to the bare branch address), the same source the Visit section
   * itself reads from, so the two never disagree.
   */
  private async locationsFor(tx: Prisma.TransactionClient, restaurantId: string, currentBranchId: string) {
    if (!(await this.access.resolveQrCapability(tx, restaurantId, 'QR_LOCATIONS', currentBranchId)).enabled) return null;
    const branches = await tx.branch.findMany({ where: { restaurantId, status: 'ACTIVE' }, select: { id: true, name: true, address: true }, orderBy: { name: 'asc' } });
    if (branches.length < 2) return null;
    return Promise.all(
      branches.map(async (b) => {
        const own = await this.content(tx, restaurantId, b.id);
        const c = own.content;
        return {
          branchId: b.id,
          name: b.name,
          isCurrent: b.id === currentBranchId,
          address: c?.address || b.address || '',
          hours: c?.hours || '',
          phone: c?.phone || ''
        };
      })
    );
  }
  async site(slug: string) {
    const resolved = await this.resolveSlug(slug);
    const page = await this.publicPage(resolved.restaurantId, resolved.branchId);
    if (!page) throw new NotFoundException('Business page is unavailable');
    const menu = await this.menus.build(resolved.restaurantId, resolved.branchId);
    const [reservationsEnabled, locations] = await this.prisma.runAsTenant(resolved.restaurantId, (tx) =>
      Promise.all([
        this.access.resolveQrCapability(tx, resolved.restaurantId, 'QR_RESERVATIONS', resolved.branchId).then((c) => c.enabled),
        this.locationsFor(tx, resolved.restaurantId, resolved.branchId)
      ])
    );
    return {
      ...page,
      reservationsEnabled,
      locations,
      restaurantName: resolved.restaurantName,
      branchName: resolved.branchName,
      currency: resolved.currency,
      items: menu.items,
      categories: menu.categories,
      menuReady: menu.ready
    };
  }
  async publicHead(slug:string){
    const page=await this.site(slug);
    const canonical=this.shareUrl(slug);
    if(!canonical)throw new NotFoundException('Public website address is not configured');
    return restaurantPageHead(page,canonical);
  }
}

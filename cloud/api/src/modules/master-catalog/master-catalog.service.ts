import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface CreateMasterCategoryDto {
  name: string;
  slug: string;
  icon?: string;
  sortOrder?: number;
}

export interface CreateMasterItemDto {
  categoryId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  basePrice: number; // in paise
  preparationTimeMinutes?: number;
  dietaryType: 'VEG' | 'NON_VEG' | 'VEGAN' | 'JAIN' | 'SWAMINARAYAN';
  isAvailable?: boolean;
  allergens?: string[];
  tags?: string[];
  taxRate?: number; // basis points e.g. 500 = 5%
  hsnCode?: string;
  recipe?: Record<string, unknown>;
}

export interface SyndicateItemDto {
  restaurantIds: string[];
  autoSync?: boolean;
}

@Injectable()
export class MasterCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async listCategories() {
    return this.prisma.masterMenuCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { items: true } } }
    });
  }

  async createCategory(dto: CreateMasterCategoryDto, actor: PlatformUser) {
    const existing = await this.prisma.masterMenuCategory.findFirst({
      where: { OR: [{ name: dto.name }, { slug: dto.slug }] }
    });
    if (existing) throw new ConflictException('Category with this name or slug already exists');

    const category = await this.prisma.masterMenuCategory.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        icon: dto.icon,
        sortOrder: dto.sortOrder ?? 0
      }
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'MASTER_CATEGORY_CREATED',
      category: 'CATALOG',
      details: { categoryId: category.id, name: category.name }
    });

    return category;
  }

  async listItems(filter?: { categoryId?: string; search?: string; dietaryType?: string }) {
    const where: any = {};
    if (filter?.categoryId) where.categoryId = filter.categoryId;
    if (filter?.dietaryType) where.dietaryType = filter.dietaryType;
    if (filter?.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } }
      ];
    }

    return this.prisma.masterMenuItem.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        _count: { select: { syndications: true } }
      },
      orderBy: { name: 'asc' }
    });
  }

  async getItemById(id: string) {
    const item = await this.prisma.masterMenuItem.findUnique({
      where: { id },
      include: {
        category: true,
        syndications: {
          include: { restaurant: { select: { id: true, name: true, city: true } } }
        }
      }
    });
    if (!item) throw new NotFoundException('Master dish not found');
    return item;
  }

  async createItem(dto: CreateMasterItemDto, actor: PlatformUser) {
    const category = await this.prisma.masterMenuCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException('Category not found');

    const item = await this.prisma.masterMenuItem.create({
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        imageUrl: dto.imageUrl,
        basePrice: dto.basePrice,
        preparationTimeMinutes: dto.preparationTimeMinutes ?? 15,
        dietaryType: dto.dietaryType,
        isAvailable: dto.isAvailable ?? true,
        allergens: (dto.allergens || []) as any,
        tags: (dto.tags || []) as any,
        taxRate: dto.taxRate ?? 500,
        hsnCode: dto.hsnCode ?? '996331',
        recipe: (dto.recipe || null) as any
      }
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'MASTER_ITEM_CREATED',
      category: 'CATALOG',
      details: { itemId: item.id, name: item.name, basePrice: item.basePrice }
    });

    return item;
  }

  async updateItem(id: string, dto: Partial<CreateMasterItemDto>, actor: PlatformUser) {
    const existing = await this.prisma.masterMenuItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Master dish not found');

    const updated = await this.prisma.masterMenuItem.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        imageUrl: dto.imageUrl,
        basePrice: dto.basePrice,
        preparationTimeMinutes: dto.preparationTimeMinutes,
        dietaryType: dto.dietaryType,
        isAvailable: dto.isAvailable,
        allergens: dto.allergens ? (dto.allergens as any) : undefined,
        tags: dto.tags ? (dto.tags as any) : undefined,
        taxRate: dto.taxRate,
        hsnCode: dto.hsnCode,
        recipe: dto.recipe ? (dto.recipe as any) : undefined
      }
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'MASTER_ITEM_UPDATED',
      category: 'CATALOG',
      details: { itemId: id, name: updated.name }
    });

    return updated;
  }

  async deleteItem(id: string, actor: PlatformUser) {
    const existing = await this.prisma.masterMenuItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Master dish not found');

    await this.prisma.masterMenuItem.delete({ where: { id } });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'MASTER_ITEM_DELETED',
      category: 'CATALOG',
      details: { itemId: id, name: existing.name }
    });

    return { success: true };
  }

  async updateCategory(id: string, dto: Partial<CreateMasterCategoryDto & { isActive?: boolean }>, actor: PlatformUser) {
    const existing = await this.prisma.masterMenuCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');

    const updated = await this.prisma.masterMenuCategory.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug,
        icon: dto.icon,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive
      }
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'MASTER_CATEGORY_UPDATED',
      category: 'CATALOG',
      details: { categoryId: id, name: updated.name }
    });

    return updated;
  }

  async deleteCategory(id: string, actor: PlatformUser) {
    const existing = await this.prisma.masterMenuCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');

    const itemCount = await this.prisma.masterMenuItem.count({ where: { categoryId: id } });
    if (itemCount > 0) {
      throw new ConflictException(`Cannot delete category "${existing.name}" because it contains ${itemCount} master dishes.`);
    }

    await this.prisma.masterMenuCategory.delete({ where: { id } });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'MASTER_CATEGORY_DELETED',
      category: 'CATALOG',
      details: { categoryId: id, name: existing.name }
    });

    return { success: true };
  }

  /**
   * Safe image upload handler: Validates content type, image size (<5MB),
   * writes to public assets directory and returns permanent accessible URL.
   */
  async uploadImage(
    dto: { fileName: string; contentType: string; base64Data: string },
    actor: PlatformUser
  ) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'];
    if (!dto.contentType || !allowedTypes.includes(dto.contentType)) {
      throw new BadRequestException('Unsupported image type. Allowed: JPEG, PNG, WEBP, SVG, GIF.');
    }

    // Clean base64 header if included (e.g. data:image/png;base64,...)
    const cleanBase64 = dto.base64Data.includes(',')
      ? dto.base64Data.split(',')[1]
      : dto.base64Data;

    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      throw new BadRequestException('Image size exceeds 5MB limit.');
    }

    const ext = dto.fileName.includes('.')
      ? dto.fileName.substring(dto.fileName.lastIndexOf('.'))
      : '.jpg';
    const safeHash = Math.random().toString(36).substring(2, 10) + '_' + Date.now();
    const targetFileName = `dish_${safeHash}${ext}`;

    const fs = await import('fs');
    const path = await import('path');
    const uploadDir = path.resolve(process.cwd(), '../super-admin-web/public/assets/uploads/catalog');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, targetFileName);
    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/assets/uploads/catalog/${targetFileName}`;

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'MASTER_IMAGE_UPLOADED',
      category: 'CATALOG',
      details: { fileName: targetFileName, sizeBytes: buffer.length, publicUrl }
    });

    return { url: publicUrl, sizeBytes: buffer.length };
  }

  /**
   * Imports the preloaded authentic JAMANVAAR culinary catalog into Master Menu.
   */
  async importStarterLibrary(actor: PlatformUser) {
    const defaultCategories = [
      { name: 'Starters & Tandoor', slug: 'starters-tandoor', icon: 'Flame', sortOrder: 1 },
      { name: 'Royal Curries & Gravies', slug: 'royal-curries', icon: 'Soup', sortOrder: 2 },
      { name: 'Heritage Gujarati & Kathiyawadi', slug: 'gujarati-kathiyawadi', icon: 'UtensilsCrossed', sortOrder: 3 },
      { name: 'Artisan Breads & Naan', slug: 'artisan-breads', icon: 'Wheat', sortOrder: 4 },
      { name: 'Fragrant Biryani & Rice', slug: 'rice-biryani', icon: 'Utensils', sortOrder: 5 },
      { name: 'Artisan Desserts & Sweets', slug: 'desserts', icon: 'Cake', sortOrder: 6 },
      { name: 'Beverages & Masala Chaas', slug: 'beverages', icon: 'Coffee', sortOrder: 7 },
      { name: 'South Indian Specialties', slug: 'south-indian', icon: 'Compass', sortOrder: 8 }
    ];

    const catMap: Record<string, string> = {};
    for (const c of defaultCategories) {
      const upserted = await this.prisma.masterMenuCategory.upsert({
        where: { slug: c.slug },
        update: { name: c.name, icon: c.icon, sortOrder: c.sortOrder },
        create: c
      });
      catMap[c.slug] = upserted.id;
    }

    const starterDishes: Array<{
      categorySlug: string;
      name: string;
      description: string;
      basePrice: number;
      preparationTimeMinutes: number;
      dietaryType: 'VEG' | 'JAIN' | 'SWAMINARAYAN' | 'NON_VEG';
      imageUrl: string;
      tags: string[];
      allergens: string[];
      hsnCode: string;
      taxRate: number;
      recipe: Record<string, unknown>;
    }> = [
      {
        categorySlug: 'starters-tandoor',
        name: 'Paneer Tikka Angara',
        description: 'Clay-oven charred cottage cheese cubes steeped in degi chili, mustard oil, and hung curd marinade.',
        basePrice: 34000,
        preparationTimeMinutes: 18,
        dietaryType: 'VEG',
        imageUrl: '/assets/menu/north-indian/paneer-tikka.jpg',
        tags: ['TANDOOR', 'CHEF_SPECIAL', 'SMOKY'],
        allergens: ['DAIRY'],
        hsnCode: '996331',
        taxRate: 500,
        recipe: {
          ingredients: ['Fresh malai paneer (250g)', 'Degi mirch (15g)', 'Hung yoghurt (100g)', 'Kachhi ghani mustard oil (20ml)', 'Roasted kasuri methi (5g)'],
          method: 'Marinate paneer for 2 hours. Skewer with bell peppers and onions. Roast in tandoor at 280°C for 8 minutes until charred edges appear. Baste with melted ghee.'
        }
      },
      {
        categorySlug: 'starters-tandoor',
        name: 'Jain Dahi Ke Kebab',
        description: 'Golden crisp shallow-fried patties of hung yoghurt, green chilies, and roasted coriander seeds, without root vegetables.',
        basePrice: 31000,
        preparationTimeMinutes: 15,
        dietaryType: 'JAIN',
        imageUrl: '/assets/menu/north-indian/hara-bhara-kebab.jpg',
        tags: ['JAIN', 'STARTER', 'SIGNATURE'],
        allergens: ['DAIRY'],
        hsnCode: '996331',
        taxRate: 500,
        recipe: {
          ingredients: ['Hung curd chakka (200g)', 'Crushed green chilies', 'Roasted cumin powder', 'Cottage cheese binder', 'Sendha namak'],
          method: 'Gently combine chilled hung curd with spices and sendha namak. Shape into oval medallions and shallow fry on brass tawa until golden-brown.'
        }
      },
      {
        categorySlug: 'royal-curries',
        name: 'Paneer Lababdar',
        description: 'Grated and cubed malai paneer simmered in a velvety tomato-cashew gravy accented with mace and kasuri methi.',
        basePrice: 38000,
        preparationTimeMinutes: 20,
        dietaryType: 'VEG',
        imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg',
        tags: ['GRAVY', 'ROYAL', 'BESTSELLER'],
        allergens: ['DAIRY', 'NUTS'],
        hsnCode: '996331',
        taxRate: 500,
        recipe: {
          ingredients: ['Paneer cubes (180g)', 'Grated paneer (40g)', 'Tomato-cashew reduction (250g)', 'Fresh malai (30ml)', 'Mace & cardamom powder'],
          method: 'Temper gravy base with shahi jeera. Fold in tomato puree and simmer until butter releases. Add paneer cubes and grated paneer. Finish with kasuri methi and cream.'
        }
      },
      {
        categorySlug: 'royal-curries',
        name: 'Swaminarayan Dal Makhani',
        description: 'Slow-simmered whole black urad and kidney beans enriched with churned white butter, crafted without onion or garlic.',
        basePrice: 36000,
        preparationTimeMinutes: 25,
        dietaryType: 'SWAMINARAYAN',
        imageUrl: '/assets/menu/north-indian/dal-makhani.jpg',
        tags: ['SWAMINARAYAN', 'DAL', 'SLOW_COOKED'],
        allergens: ['DAIRY'],
        hsnCode: '996331',
        taxRate: 500,
        recipe: {
          ingredients: ['Whole urad dal (150g)', 'Rajma (30g)', 'Safed makhan (white butter 50g)', 'Pureed vine tomatoes', 'Hing (asafoetida)', 'Ginger juliennes'],
          method: 'Overnight simmered lentils on slow embers for 12 hours. Pureed tomato reduction tempered with asafoetida and ginger. Whisked with safed makhan.'
        }
      },
      {
        categorySlug: 'gujarati-kathiyawadi',
        name: 'Surti Undhiyu Special',
        description: 'Traditional Gujarati winter medley of baby brinjals, surti papdi, purple yam, and muthiyas in fenugreek masala.',
        basePrice: 35000,
        preparationTimeMinutes: 22,
        dietaryType: 'VEG',
        imageUrl: '/assets/menu/gujarati/undhiyu.jpg',
        tags: ['GUJARATI', 'HERITAGE', 'WINTER_SPECIAL'],
        allergens: ['GLUTEN'],
        hsnCode: '996331',
        taxRate: 500,
        recipe: {
          ingredients: ['Surti papdi (100g)', 'Kand (purple yam 50g)', 'Baby eggplant stuffed with coconut-peanut masala', 'Methi muthiya (6 pcs)'],
          method: 'Layer earthen matka pot with oil and spices. Steam vegetables upside down on low heat until tender and aromatic. Garnish with freshly grated coconut and coriander.'
        }
      },
      {
        categorySlug: 'gujarati-kathiyawadi',
        name: 'Kathiyawadi Sev Tameta Nu Shaak',
        description: 'Tangy spiced tomato curry tempered with mustard and asafoetida, topped with crunchy ratlami sev.',
        basePrice: 26000,
        preparationTimeMinutes: 12,
        dietaryType: 'VEG',
        imageUrl: '/assets/menu/gujarati/sev-tameta.jpg',
        tags: ['KATHIYAWADI', 'QUICK_EAT', 'SPICY'],
        allergens: ['GLUTEN'],
        hsnCode: '996331',
        taxRate: 500,
        recipe: {
          ingredients: ['Desi sour tomatoes (200g)', 'Spicy ratlami sev (60g)', 'Jaggery (10g)', 'Rai, jeera, hing', 'Fresh green chilies'],
          method: 'Heat groundnut oil in kadai. Splutter mustard and hing. Sauté chopped tomatoes with turmeric and jaggery until mushy. Top with crispy sev immediately before serving.'
        }
      },
      {
        categorySlug: 'artisan-breads',
        name: 'Tandoori Garlic Butter Naan',
        description: 'Hand-stretched leavened flatbread baked on tandoor walls, brushed with roasted minced garlic and herb butter.',
        basePrice: 9000,
        preparationTimeMinutes: 8,
        dietaryType: 'VEG',
        imageUrl: '/assets/menu/north-indian/garlic-naan.jpg',
        tags: ['BREAD', 'TANDOOR'],
        allergens: ['GLUTEN', 'DAIRY'],
        hsnCode: '996331',
        taxRate: 500,
        recipe: {
          ingredients: ['Maida dough fermented with curd (120g)', 'Minced garlic (15g)', 'Fresh chopped coriander', 'Salted table butter (20g)'],
          method: 'Roll teardrop naan, press minced garlic and coriander on top. Slap against clay tandoor wall at 300°C for 90 seconds until blistered. Slather with melted butter.'
        }
      },
      {
        categorySlug: 'artisan-breads',
        name: 'Kathiyawadi Bajra Rotla with Ghee',
        description: 'Thick, rustic pearl millet flatbread patted by hand and roasted on terracotta tawa with pure A2 cow ghee.',
        basePrice: 6000,
        preparationTimeMinutes: 10,
        dietaryType: 'VEG',
        imageUrl: '/assets/menu/gujarati/rotla.jpg',
        tags: ['RUSTIC', 'GLUTEN_FREE', 'HEALTHY'],
        allergens: ['DAIRY'],
        hsnCode: '996331',
        taxRate: 500,
        recipe: {
          ingredients: ['Stone-ground bajra flour (120g)', 'Warm water & salt', 'Desi cow ghee (25g)'],
          method: 'Knead with palm pressure until supple. Hand-pat into thick round rotla. Cook on earthen clay tavadi until golden crust forms. Break open and pool with golden desi ghee.'
        }
      },
      {
        categorySlug: 'rice-biryani',
        name: 'Dum Pukht Shahi Vegetable Biryani',
        description: 'Aged basmati rice sealed with seasonal garden vegetables, saffron milk, caramelized shallots, and whole spices in a sealed handi.',
        basePrice: 38000,
        preparationTimeMinutes: 25,
        dietaryType: 'VEG',
        imageUrl: '/assets/menu/north-indian/biryani.jpg',
        tags: ['BIRYANI', 'DUM_PUKHT', 'ROYAL'],
        allergens: ['DAIRY', 'NUTS'],
        hsnCode: '996331',
        taxRate: 500,
        recipe: {
          ingredients: ['Aged 1121 basmati rice (180g)', 'Mixed garden vegetables (150g)', 'Kashmiri saffron milk (30ml)', 'Birista (fried onions)', 'Whole garam masala'],
          method: 'Layer parboiled spiced basmati rice over sautéed vegetable masala. Top with saffron threads, kewra water, mint, and desi ghee. Seal with dough rim and dum-cook on low heat for 18 minutes.'
        }
      },
      {
        categorySlug: 'artisan-desserts-sweets',
        name: 'Gulab Jamun Flambé with Silver Leaf',
        description: 'Warm, soft khoya dumplings infused with green cardamom and saffron syrup, finished with pure silver vark.',
        basePrice: 16000,
        preparationTimeMinutes: 10,
        dietaryType: 'VEG',
        imageUrl: '/assets/menu/north-indian/gulab-jamun.jpg',
        tags: ['DESSERT', 'HOT', 'FESTIVE'],
        allergens: ['DAIRY', 'GLUTEN'],
        hsnCode: '996331',
        taxRate: 500,
        recipe: {
          ingredients: ['Hariyali khoya (100g)', 'Chenna (30g)', 'Saffron-cardamom sugar syrup (150ml)', 'Desi ghee for frying', 'Edible silver vark'],
          method: 'Roll seamless balls of khoya and chenna dough. Deep-fry on low flame in pure desi ghee until deep mahogany brown. Steep in hot sugar syrup for at least 45 minutes.'
        }
      },
      {
        categorySlug: 'beverages',
        name: 'Royal Masala Chaas (Spiced Buttermilk)',
        description: 'Traditional churned spiced buttermilk infused with dry-roasted cumin, fresh garden mint, ginger, and black rock salt.',
        basePrice: 9000,
        preparationTimeMinutes: 5,
        dietaryType: 'VEG',
        imageUrl: '/assets/menu/north-indian/chaas.jpg',
        tags: ['PROBIOTIC', 'REFRESHING', 'TRADITIONAL'],
        allergens: ['DAIRY'],
        hsnCode: '996331',
        taxRate: 500,
        recipe: {
          ingredients: ['Fresh churned curd (150ml)', 'Chilled water (150ml)', 'Bhuna jeera powder (5g)', 'Kala namak (3g)', 'Crushed mint leaves'],
          method: 'Whisk curd and chilled water with traditional valona or blender until foamy. Whisk in roasted cumin, black salt, and finely pounded mint. Serve chilled in clay matka.'
        }
      }
    ];

    let createdCount = 0;
    let updatedCount = 0;

    for (const d of starterDishes) {
      const categoryId = catMap[d.categorySlug] || catMap['starters-tandoor'];
      const existing = await this.prisma.masterMenuItem.findFirst({
        where: { name: d.name }
      });

      if (!existing) {
        await this.prisma.masterMenuItem.create({
          data: {
            categoryId,
            name: d.name,
            description: d.description,
            basePrice: d.basePrice,
            preparationTimeMinutes: d.preparationTimeMinutes,
            dietaryType: d.dietaryType,
            imageUrl: d.imageUrl,
            tags: d.tags as any,
            allergens: d.allergens as any,
            hsnCode: d.hsnCode,
            taxRate: d.taxRate,
            recipe: d.recipe as any,
            isAvailable: true
          }
        });
        createdCount++;
      } else {
        await this.prisma.masterMenuItem.update({
          where: { id: existing.id },
          data: {
            categoryId,
            description: d.description,
            basePrice: d.basePrice,
            preparationTimeMinutes: d.preparationTimeMinutes,
            dietaryType: d.dietaryType,
            imageUrl: d.imageUrl,
            tags: d.tags as any,
            allergens: d.allergens as any,
            hsnCode: d.hsnCode,
            taxRate: d.taxRate,
            recipe: d.recipe as any
          }
        });
        updatedCount++;
      }
    }

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'STARTER_LIBRARY_IMPORTED',
      category: 'CATALOG',
      details: { categoriesCount: defaultCategories.length, createdCount, updatedCount }
    });

    return {
      success: true,
      categoriesCount: defaultCategories.length,
      dishesCreated: createdCount,
      dishesUpdated: updatedCount
    };
  }

  /**
   * Syndicates a master dish to targeted restaurants without overwriting custom pricing
   */
  async syndicateItem(itemId: string, dto: SyndicateItemDto, actor: PlatformUser) {
    const masterItem = await this.prisma.masterMenuItem.findUnique({ where: { id: itemId } });
    if (!masterItem) throw new NotFoundException('Master dish not found');

    const results = [];
    for (const restaurantId of dto.restaurantIds) {
      const existing = await this.prisma.restaurantMenuSyndication.findUnique({
        where: { restaurantId_masterItemId: { restaurantId, masterItemId: itemId } }
      });

      if (!existing) {
        const syndication = await this.prisma.restaurantMenuSyndication.create({
          data: {
            restaurantId,
            masterItemId: itemId,
            autoSync: dto.autoSync ?? true,
            isCustomized: false,
            lastSyncedAt: new Date()
          }
        });
        results.push({ restaurantId, action: 'CREATED', id: syndication.id });
      } else if (!existing.isCustomized && existing.autoSync) {
        const updated = await this.prisma.restaurantMenuSyndication.update({
          where: { id: existing.id },
          data: { lastSyncedAt: new Date(), status: 'ACTIVE' }
        });
        results.push({ restaurantId, action: 'UPDATED', id: updated.id });
      } else {
        results.push({ restaurantId, action: 'SKIPPED_CUSTOMIZED', id: existing.id });
      }
    }

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'MASTER_ITEM_SYNDICATED',
      category: 'CATALOG',
      details: { itemId, targetCount: dto.restaurantIds.length, results }
    });

    return { itemId, processed: results };
  }

  async listSyndicationsForRestaurant(restaurantId: string) {
    return this.prisma.restaurantMenuSyndication.findMany({
      where: { restaurantId },
      include: { masterItem: { include: { category: true } } },
      orderBy: { updatedAt: 'desc' }
    });
  }
}


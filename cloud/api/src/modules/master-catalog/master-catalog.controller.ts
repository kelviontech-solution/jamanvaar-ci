import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import {
  CreateMasterCategoryDto,
  CreateMasterItemDto,
  MasterCatalogService,
  SyndicateItemDto
} from './master-catalog.service';

@Controller('api/v1/master-catalog')
@UseGuards(PlatformAuthGuard)
export class MasterCatalogController {
  constructor(private readonly masterCatalogService: MasterCatalogService) {}

  @Get('categories')
  listCategories() {
    return this.masterCatalogService.listCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateMasterCategoryDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.masterCatalogService.createCategory(dto, actor);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() dto: Partial<CreateMasterCategoryDto & { isActive?: boolean }>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.masterCatalogService.updateCategory(id, dto, actor);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.masterCatalogService.deleteCategory(id, actor);
  }

  @Post('import-starter-library')
  importStarterLibrary(@CurrentPlatformUser() actor: PlatformUser) {
    return this.masterCatalogService.importStarterLibrary(actor);
  }

  @Post('upload-image')
  uploadImage(
    @Body() dto: { fileName: string; contentType: string; base64Data: string },
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.masterCatalogService.uploadImage(dto, actor);
  }

  @Get('items')
  listItems(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('dietaryType') dietaryType?: string
  ) {
    return this.masterCatalogService.listItems({ categoryId, search, dietaryType });
  }

  @Get('items/:id')
  getItem(@Param('id') id: string) {
    return this.masterCatalogService.getItemById(id);
  }

  @Post('items')
  createItem(@Body() dto: CreateMasterItemDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.masterCatalogService.createItem(dto, actor);
  }

  @Patch('items/:id')
  updateItem(
    @Param('id') id: string,
    @Body() dto: Partial<CreateMasterItemDto>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.masterCatalogService.updateItem(id, dto, actor);
  }

  @Delete('items/:id')
  deleteItem(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.masterCatalogService.deleteItem(id, actor);
  }

  @Post('items/:id/syndicate')
  syndicateItem(
    @Param('id') id: string,
    @Body() dto: SyndicateItemDto,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.masterCatalogService.syndicateItem(id, dto, actor);
  }

  @Get('syndications/:restaurantId')
  listSyndications(@Param('restaurantId') restaurantId: string) {
    return this.masterCatalogService.listSyndicationsForRestaurant(restaurantId);
  }
}

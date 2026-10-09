import { Controller, Get, HttpCode, HttpStatus, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApplicationsService } from './applications.service';

/**
 * Tauri's updater plugin polls this directly from every installed desktop app -- no
 * platform session exists to authenticate, so this is deliberately outside
 * ApplicationsController's PlatformAuthGuard rather than exempted from it.
 */
@Controller('api/v1/updater')
export class UpdaterManifestController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get(':appCode/latest.json')
  @HttpCode(HttpStatus.OK)
  async latest(@Param('appCode') appCode: string, @Res({ passthrough: true }) res: Response) {
    const manifest = await this.applications.getUpdaterManifest(appCode);
    if (!manifest) {
      res.status(HttpStatus.NO_CONTENT);
      return;
    }
    return manifest;
  }
}

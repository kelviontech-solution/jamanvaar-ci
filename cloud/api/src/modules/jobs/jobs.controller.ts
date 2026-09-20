import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { JobsService } from './jobs.service';

@Controller('api/v1/platform/jobs')
@UseGuards(PlatformAuthGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  status() {
    return this.jobs.status();
  }

  @Post('run')
  run() {
    return this.jobs.runAll('manual');
  }
}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MenuSyncController } from './menu-sync.controller';
import { MenuSyncService } from './menu-sync.service';

@Module({
  imports: [PrismaModule],
  controllers: [MenuSyncController],
  providers: [MenuSyncService],
  exports: [MenuSyncService]
})
export class PaymentsModule {}

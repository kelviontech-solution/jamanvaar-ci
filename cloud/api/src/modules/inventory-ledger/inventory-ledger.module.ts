import { Module } from '@nestjs/common';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { InventoryLedgerController } from './inventory-ledger.controller';
import { InventoryLedgerService } from './inventory-ledger.service';

@Module({
  controllers: [InventoryLedgerController],
  providers: [InventoryLedgerService, DeviceAuthGuard]
})
export class InventoryLedgerModule {}

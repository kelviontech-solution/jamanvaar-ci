import { Module } from '@nestjs/common';
import { QrGuestOrderingController } from './qr-guest-ordering.controller';
import { QrGuestOrderingService } from './qr-guest-ordering.service';
import { QrOrderingModule } from '../qr-ordering/qr-ordering.module';

@Module({
  imports: [QrOrderingModule],
  controllers: [QrGuestOrderingController],
  providers: [QrGuestOrderingService]
})
export class QrGuestOrderingModule {}

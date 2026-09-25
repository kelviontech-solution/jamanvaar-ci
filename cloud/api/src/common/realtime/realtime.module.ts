import { Global, Module } from '@nestjs/common';
import { DeviceAuthGuard } from '../guards/device-auth.guard';
import { RealtimeBus } from './realtime-bus';
import { RealtimeController } from './realtime.controller';

@Global()
@Module({
  controllers: [RealtimeController],
  providers: [RealtimeBus, DeviceAuthGuard],
  exports: [RealtimeBus]
})
export class RealtimeModule {}

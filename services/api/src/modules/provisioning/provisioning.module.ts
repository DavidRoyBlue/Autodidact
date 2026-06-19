import { Global, Module } from '@nestjs/common';
import { ProvisioningService } from './provisioning.service.js';

@Global()
@Module({
  providers: [ProvisioningService],
  exports: [ProvisioningService],
})
export class ProvisioningModule {}

import type { HealthResponse } from '@platform/contracts';
import { Controller, Get } from '@nestjs/common';

/** Liveness only: reports that the process is serving HTTP. No dependencies are probed. */
@Controller('health')
export class HealthController {
  @Get()
  get(): HealthResponse {
    return { status: 'ok', service: 'api' };
  }
}

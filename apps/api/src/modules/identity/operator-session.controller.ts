import { Controller, Get, UseGuards } from '@nestjs/common';

import { OperatorGuard } from './guards.js';

/**
 * `GET /operator/session`: confirms an authenticated operator session. The operator control plane
 * is a separate trust domain (Doc 04 §3); its first real actions arrive with provisioning (M2.4).
 */
@Controller('operator')
@UseGuards(OperatorGuard)
export class OperatorSessionController {
  @Get('session')
  session(): { kind: 'operator' } {
    return { kind: 'operator' };
  }
}

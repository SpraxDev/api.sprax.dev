import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../constants.js';
import type { UsernameToUuidResponse } from '../../../../minecraft/MinecraftApiClient.js';
import MinecraftProfileService from '../../../../minecraft/profile/MinecraftProfileService.js';
import CacheHeaderHelper from '../../../../util/http/CacheHeaderHelper.js';
import { NotFoundError } from '../../../errors/HttpErrors.js';
import type { FastifyInstanceWithZod } from '../../../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from '../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class UuidRouter implements Router {
  constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly cacheHeaderHelper: CacheHeaderHelper,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v2/uuid/:username?', {
      schema: {
        params: z.object({
          username: z.string().min(3).max(16),
        }),
      },
    }, async (request, reply): Promise<RouteReturn> => {
      const profile = await this.minecraftProfileService.provideProfileByUsername(request.params.username);
      if (profile == null) {
        reply.header('Cache-Control', 'max-age=60, s-maxage=60');
        throw new NotFoundError('No UUID found for username');
      }

      this.cacheHeaderHelper.forPublic(reply, { baseCacheDuration: 60, age: profile.ageInSeconds, immutable: true });
      return reply
        .send({
          id: profile.profile.id,
          name: profile.profile.name,
        } satisfies UsernameToUuidResponse);
    });
  }
}

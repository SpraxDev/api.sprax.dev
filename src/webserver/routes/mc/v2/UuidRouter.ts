import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../constants.js';
import MinecraftProfileService from '../../../../minecraft/profile/MinecraftProfileService.js';
import CacheHeaderHelper from '../../../../util/http/CacheHeaderHelper.js';
import { NotFoundError } from '../../../errors/HttpErrors.js';
import type { FastifyInstanceWithZod } from '../../../server/FastifyWebServer.js';
import type { default as Router } from '../../Router.js';

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
        hide: false,
        summary: 'Get the UUID for a given Minecraft username',
        tags: ['Minecraft (v2)'],

        params: z.object({
          username: z.string().min(3).max(16),
        }),

        response: {
          200: z.object({
            id: z.string().meta({ example: '955e4cf6411c40d1a1765bc8e03a8a9a' }).describe('Minecraft profile ID'),
            name: z.string().meta({ example: 'SpraxDev' }).describe('Minecraft profile name'),
          }),
          404: z.object({ error: z.string() }).describe('UUID/Profile not found'),
        },
      },
    }, async (request, reply) => {
      const profile = await this.minecraftProfileService.provideProfileByUsername(request.params.username);
      if (profile == null) {
        return reply
          .status(404)
          .header('Cache-Control', 'max-age=60, s-maxage=60')
          .send(new NotFoundError('No UUID found for username').createResponseBody());
      }

      this.cacheHeaderHelper.forPublic(reply, { baseCacheDuration: 60, age: profile.ageInSeconds, immutable: true });

      return reply
        .status(200)
        .send({
          id: profile.profile.id,
          name: profile.profile.name,
        });
    });
  }
}

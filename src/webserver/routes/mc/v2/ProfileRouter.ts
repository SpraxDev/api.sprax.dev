import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../constants.js';
import CacheHeaderHelper from '../../../../util/http/CacheHeaderHelper.js';
import MinecraftProfileByNameOrIdProvider from '../../../../util/http/MinecraftProfileByNameOrIdProvider.js';
import { NotFoundError } from '../../../errors/HttpErrors.js';
import type { FastifyInstanceWithZod } from '../../../server/FastifyWebServer.js';
import type { default as Router } from '../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class ProfileRouter implements Router {
  constructor(
    private readonly minecraftProfileByNameOrIdProvider: MinecraftProfileByNameOrIdProvider,
    private readonly cacheHeaderHelper: CacheHeaderHelper,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v2/profile/:nameOrId?', {
      schema: {
        hide: false,
        summary: 'Get the profile for a given UUID or username',
        tags: ['Minecraft (v2)'],

        params: z.object({
          nameOrId: z.string().nonempty().describe('UUID or username'),
        }),

        response: {
          200: z.object({
            id: z.string().meta({ example: '955e4cf6411c40d1a1765bc8e03a8a9a' }),
            name: z.string().meta({ example: 'SpraxDev' }),
            properties: z.array(z.object({
              name: z.string().meta({ example: 'textures' }),
              value: z.base64().meta({ example: 'Base64 string' }),
              signature: z.base64().meta({ example: 'Base64 string' }),
            })),
            profileActions: z.array(z.string()),
          }),
          404: z.object({ error: z.string() }).describe('Profile not found'),
        },
      },
    }, async (request, reply) => {
      const profile = await this.minecraftProfileByNameOrIdProvider.provide(request.params.nameOrId);
      if (profile == null) {
        return reply
          .status(404)
          .header('Cache-Control', 'max-age=60, s-maxage=60')
          .send(new NotFoundError('Unable to find a profile for the given UUID or username').createResponseBody());
      }

      this.cacheHeaderHelper.forPublic(reply, { baseCacheDuration: 60, age: profile.ageInSeconds, immutable: true });
      return reply
        .status(200)
        .send(profile.profile);
    });
  }
}

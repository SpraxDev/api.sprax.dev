import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../constants.js';
import CacheHeaderHelper from '../../../../util/http/CacheHeaderHelper.js';
import MinecraftProfileByNameOrIdProvider from '../../../../util/http/MinecraftProfileByNameOrIdProvider.js';
import { NotFoundError } from '../../../errors/HttpErrors.js';
import type { FastifyInstanceWithZod } from '../../../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from '../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class ProfileRouter implements Router {
  constructor(
    private readonly minecraftProfileByNameOrIdProvider: MinecraftProfileByNameOrIdProvider,
    private readonly cacheHeaderHelper: CacheHeaderHelper,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v2/profile/:user?', {
      schema: {
        params: z.object({
          user: z.string().nonempty(),
        }),
      },
    }, async (request, reply): Promise<RouteReturn> => {
      const profile = await this.minecraftProfileByNameOrIdProvider.provide(request.params.user);
      if (profile == null) {
        reply.header('Cache-Control', 'max-age=60, s-maxage=60');
        throw new NotFoundError(`Unable to find a profile for the given UUID or username`);
      }

      this.cacheHeaderHelper.forPublic(reply, { baseCacheDuration: 60, age: profile.ageInSeconds, immutable: true });
      return reply
        .send(profile.profile);
    });
  }
}

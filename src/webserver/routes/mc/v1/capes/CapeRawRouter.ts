import type { FastifyRequest } from 'fastify';
import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../../constants.js';
import { CAPE_TYPE_STRINGS, type CapeType } from '../../../../../minecraft/cape/CapeType.js';
import UserCapeService from '../../../../../minecraft/cape/UserCapeService.js';
import MinecraftProfile from '../../../../../minecraft/value-objects/MinecraftProfile.js';
import MinecraftApiV1LegacyHelper from '../../../../../util/http/MinecraftApiV1LegacyHelper.js';
import { ApiV1BadRequestError, ApiV1NotFoundError } from '../../../../errors/ApiV1HttpError.js';
import type { FastifyInstanceWithZod } from '../../../../server/FastifyWebServer.js';
import noopValidatorCompiler from '../../../../server/noopValidatorCompiler.js';
import type { default as Router } from '../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class CapeRawRouter implements Router {
  constructor(
    private readonly legacyHelper: MinecraftApiV1LegacyHelper,
    private readonly userCapeService: UserCapeService,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v1/capes/:capeType/:nameOrId?', {
      validatorCompiler: noopValidatorCompiler,
      schema: {
        hide: false,
        deprecated: true,
        summary: 'Get a specific cape texture for a given player',
        tags: ['Minecraft (v1)'],

        params: z.object({
          capeType: z.enum(CAPE_TYPE_STRINGS).describe('Cape type/provider'),
          nameOrId: z.string().nonempty().describe('UUID or username'),
        }),
        querystring: z.object({
          download: z.enum(['1', '0', 'true', 'false']).optional(),
        }),

        response: {
          200: {
            content: {
              'image/png': { schema: z.string().meta({ contentEncoding: 'binary', contentMediaType: 'image/png' }) },
              'image/*': { schema: z.string().meta({ contentEncoding: 'binary' }) },
              'application/octet-stream': {
                schema: z.string().meta({ contentEncoding: 'binary', contentMediaType: 'application/octet-stream' }),
              },
            },
          },
          404: z.object({ error: z.string(), message: z.string() }).describe('UUID/Profile/Cape not found'),
        },
      },
    }, async (request: FastifyRequest, reply) => {
      const inputCapeType = (request.params as any).capeType;
      if (typeof inputCapeType !== 'string' || !CAPE_TYPE_STRINGS.includes(inputCapeType.toUpperCase())) {
        throw ApiV1BadRequestError.missingOrInvalidUrlParameter('capeType', `capeType in [${CAPE_TYPE_STRINGS.join(', ')}]`);
      }
      const capeType = inputCapeType.toUpperCase() as CapeType;

      const forceDownload = this.legacyHelper.parseBoolean((request.query as any).download) ?? false;

      const profile = await this.legacyHelper.provideProfileByNameOrId((request.params as any).nameOrId);
      if (profile == null) {
        return reply
          .status(404)
          .header('Cache-Control', 'max-age=60, s-maxage=60')
          .send(ApiV1NotFoundError.profileForGivenUserNotFound().createResponseBody());
      }

      const minecraftProfile = new MinecraftProfile(profile.profile);
      const capeResponse = await this.userCapeService.provide(minecraftProfile, capeType);
      if (capeResponse == null) {
        return reply
          .status(404)
          .header('Cache-Control', 'max-age=60, s-maxage=60')
          .send(new ApiV1NotFoundError('User does not have a cape for that type').createResponseBody());
      }

      reply.header('Content-Type', capeResponse.mimeType);
      if (forceDownload) {
        reply.header('Content-Disposition', `attachment; filename="${profile.profile.name}-${capeType.toLowerCase()}.png"`);
        reply.header('Content-Type', 'application/octet-stream');
      }

      return reply
        .header('Cache-Control', 'max-age=60, s-maxage=60')
        .send(capeResponse.image);
    });
  }
}

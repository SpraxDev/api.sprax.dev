import type { FastifyRequest } from 'fastify';
import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../../constants.js';
import { CAPE_TYPE_STRINGS, CapeType } from '../../../../../minecraft/cape/CapeType.js';
import Cape2dRenderer from '../../../../../minecraft/cape/renderer/Cape2dRenderer.js';
import UserCapeService from '../../../../../minecraft/cape/UserCapeService.js';
import MinecraftProfile from '../../../../../minecraft/value-objects/MinecraftProfile.js';
import MinecraftApiV1LegacyHelper from '../../../../../util/http/MinecraftApiV1LegacyHelper.js';
import { ApiV1BadRequestError, ApiV1NotFoundError } from '../../../../errors/ApiV1HttpError.js';
import type { FastifyInstanceWithZod } from '../../../../server/FastifyWebServer.js';
import noopValidatorCompiler from '../../../../server/noopValidatorCompiler.js';
import type { default as Router } from '../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class CapeRenderRouter implements Router {
  constructor(
    private readonly legacyHelper: MinecraftApiV1LegacyHelper,
    private readonly userCapeService: UserCapeService,
    private readonly cape2dRenderer: Cape2dRenderer,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v1/capes/:capeType/:nameOrId/render', {
      validatorCompiler: noopValidatorCompiler,
      schema: {
        hide: false,
        deprecated: true,
        summary: 'Get a simple rendered cape image for a given player',
        tags: ['Minecraft (v1)'],

        params: z.object({
          capeType: z.enum(CAPE_TYPE_STRINGS).describe('Cape type/provider'),
          nameOrId: z.string().nonempty().describe('UUID or username'),
        }),
        querystring: z.object({
          download: z.enum(['1', '0', 'true', 'false']).optional(),
          size: z.int().min(8).max(1024).default(512),
        }),

        response: {
          200: {
            content: {
              'image/png': { schema: z.string().meta({ contentEncoding: 'binary', contentMediaType: 'image/png' }) },
              'application/octet-stream': {
                schema: z.string().meta({ contentEncoding: 'binary', contentMediaType: 'application/octet-stream' }),
              },
            },
          },
          404: z.object({ error: z.string(), message: z.string() }).describe('UUID/Profile/Cape not found'),
          503: z.object({ error: z.string(), message: z.string() })
            .meta({
              example: {
                error: 'Service Unavailable',
                message: 'Rendering LabyMod-Capes is currently not supported',
              },
            }),
        },
      },
    }, async (request: FastifyRequest, reply) => {
      const inputCapeType = (request.params as any).capeType;
      if (typeof inputCapeType !== 'string' || !CAPE_TYPE_STRINGS.includes(inputCapeType.toUpperCase())) {
        throw ApiV1BadRequestError.missingOrInvalidUrlParameter('capeType', `capeType in [${CAPE_TYPE_STRINGS.join(', ')}]`);
      }

      const forceDownload = this.legacyHelper.parseBoolean((request.query as any).download) ?? false;
      const size = this.legacyHelper.parseSize((request.query as any).size) ?? 512;
      const capeType = inputCapeType.toUpperCase() as CapeType;

      if (capeType == CapeType.LABYMOD) {
        return reply
          .status(503)
          .send({
            error: 'Service Unavailable',
            message: 'Rendering LabyMod-Capes is currently not supported',
          });
      }

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

      const capeRenderResult = await this.cape2dRenderer.renderCape(capeResponse.image, capeType);
      const renderCapeImage = await capeRenderResult.toPngBuffer({ width: size, height: size });

      reply.header('Content-Type', 'image/png');
      if (forceDownload) {
        reply.header('Content-Disposition', `attachment; filename="${profile.profile.name}-${capeType.toLowerCase()}.png"`);
        reply.header('Content-Type', 'application/octet-stream');
      }

      return reply
        .header('Cache-Control', 'max-age=60, s-maxage=60')
        .send(renderCapeImage);
    });
  }
}

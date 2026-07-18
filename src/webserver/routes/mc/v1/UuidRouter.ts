import type { FastifyRequest } from 'fastify';
import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../constants.js';
import MinecraftProfileService from '../../../../minecraft/profile/MinecraftProfileService.js';
import CacheHeaderHelper from '../../../../util/http/CacheHeaderHelper.js';
import { ApiV1BadRequestError, ApiV1NotFoundError } from '../../../errors/ApiV1HttpError.js';
import type { FastifyInstanceWithZod } from '../../../server/FastifyWebServer.js';
import noopValidatorCompiler from '../../../server/noopValidatorCompiler.js';
import type { default as Router } from '../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class UuidRouter implements Router {
  constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly cacheHeaderHelper: CacheHeaderHelper,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v1/uuid/:username?', {
      validatorCompiler: noopValidatorCompiler,
      schema: {
        hide: false,
        deprecated: true,
        summary: 'Get the UUID for a given Minecraft username',
        tags: ['Minecraft (v1)'],

        params: z.object({
          username: z.string().min(3).max(16),
        }),

        response: {
          200: z.object({
            id: z.string().meta({ example: '955e4cf6411c40d1a1765bc8e03a8a9a' }).describe('Minecraft profile ID'),
            name: z.string().meta({ example: 'SpraxDev' }).describe('Minecraft profile name'),
          }),
          404: z.object({ error: z.string(), message: z.string() }).describe('UUID/Profile not found'),
        },
      },
    }, async (request: FastifyRequest, reply) => {
      const inputUsername = (request.params as any).username;
      if (typeof inputUsername !== 'string' || inputUsername.length <= 0) {
        throw ApiV1BadRequestError.missingOrInvalidUrlParameter('name', 'name.length > 0');
      }

      if (inputUsername.length > 16 || inputUsername.length < 3) {
        return reply
          .status(404)
          .header('Cache-Control', 'max-age=300, s-maxage=300')
          .send(ApiV1NotFoundError.uuidForGivenUsernameNotFound().createResponseBody());
      }

      const profile = await this.minecraftProfileService.provideProfileByUsername(inputUsername);
      if (profile == null) {
        return reply
          .status(404)
          .header('Cache-Control', 'max-age=120, s-maxage=120')
          .send(ApiV1NotFoundError.uuidForGivenUsernameNotFound().createResponseBody());
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

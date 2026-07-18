import type { FastifyRequest } from 'fastify';
import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../constants.js';
import MinecraftProfile from '../../../../minecraft/value-objects/MinecraftProfile.js';
import CacheHeaderHelper from '../../../../util/http/CacheHeaderHelper.js';
import MinecraftApiV1LegacyHelper from '../../../../util/http/MinecraftApiV1LegacyHelper.js';
import { ApiV1NotFoundError } from '../../../errors/ApiV1HttpError.js';
import type { FastifyInstanceWithZod } from '../../../server/FastifyWebServer.js';
import noopValidatorCompiler from '../../../server/noopValidatorCompiler.js';
import type { default as Router } from '../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class ProfileRouter implements Router {
  constructor(
    private readonly legacyHelper: MinecraftApiV1LegacyHelper,
    private readonly cacheHeaderHelper: CacheHeaderHelper,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v1/profile/:nameOrId?', {
      validatorCompiler: noopValidatorCompiler,
      schema: {
        hide: false,
        deprecated: true,
        summary: 'Get the profile for a given UUID or username',
        tags: ['Minecraft (v1)'],

        params: z.object({
          nameOrId: z.string().nonempty().describe('UUID or username'),
        }),
        querystring: z.object({
          raw: z.enum(['1', '0', 'true', 'false']).optional(),
          full: z.enum(['1', '0', 'true', 'false']).optional(),
        }),

        response: {
          200: z.union([
            z.strictObject({
              id: z.string(),
              name: z.string(),
              properties: z.array(z.object({
                name: z.string(),
                value: z.string(),
                signature: z.string(),
              })),
              legacy: z.boolean(),
              profileActions: z.array(z.string()),
            }),
            z.strictObject({
              id: z.string(),
              id_hyphens: z.string(),
              name: z.string(),
              legacy: z.boolean(),

              textures: z.object({
                skinUrl: z.httpUrl().nullable(),
                capeUrl: z.httpUrl().nullable(),
                texture_value: z.string().optional(),
                texture_signature: z.string().optional(),
              }),

              profile_actions: z.array(z.string()),
              name_history: z.array(z.unknown()).length(0),
            }),
          ]),
          404: z.object({ error: z.string(), message: z.string() }).describe('UUID/Profile not found'),
        },
      },
    }, async (request: FastifyRequest, reply) => {
      const profile = await this.legacyHelper.provideProfileByNameOrId((request.params as any).nameOrId);
      if (profile == null) {
        return reply
          .status(404)
          .header('Cache-Control', 'max-age=60, s-maxage=60')
          .send(ApiV1NotFoundError.profileForGivenUserNotFound().createResponseBody());
      }

      let sendProcessedProfile = false;

      const inputRaw = this.legacyHelper.parseBoolean((request.query as any).raw);
      const inputFull = this.legacyHelper.parseBoolean((request.query as any).full);
      if (inputRaw != null) {
        sendProcessedProfile = !inputRaw;
      } else if (inputFull != null) {
        sendProcessedProfile = inputFull;
      }

      this.cacheHeaderHelper.forPublic(reply, { baseCacheDuration: 60, age: profile.ageInSeconds, immutable: true });

      if (!sendProcessedProfile) {
        return reply
          .status(200)
          .send({
            legacy: false,
            ...profile.profile,
          });
      }

      const minecraftProfile = new MinecraftProfile(profile.profile);
      return reply
        .status(200)
        .send({
          id: profile.profile.id,
          id_hyphens: profile.profile.id.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'),
          name: profile.profile.name,
          legacy: false,

          textures: {
            skinUrl: minecraftProfile.parseTextures()?.skinUrl ?? null,
            capeUrl: minecraftProfile.parseTextures()?.capeUrl ?? null,
            texture_value: minecraftProfile.getTexturesProperty()?.value,
            texture_signature: minecraftProfile.getTexturesProperty()?.signature,
          },

          profile_actions: profile.profile.profileActions,
          name_history: [],
        });
    });
  }
}

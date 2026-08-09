import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../../constants.js';
import DatabaseClient from '../../../../../database/DatabaseClient.js';
import type { FastifyInstanceWithZod } from '../../../../server/FastifyWebServer.js';
import type { default as Router } from '../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class RandomRouter implements Router {
  private readonly randomSkinSchema = z.array(z.strictObject({
    url: z.string(),
    texture_value: z.string(),
    texture_signature: z.string(),
    skin_id: z.bigint(),
  }));

  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v1/skin/random', {
      schema: {
        hide: true,
        // Officially only used by remadisson – Maybe SkinDB should have a random endpoint in the future ^^
        deprecated: true,
        tags: ['Minecraft (v1)'],

        response: {
          200: z.object({
            'x-warning': z.string()
              .optional()
              .describe('Will contain a deprecation warning etc., when a stable replacement endpoint exists in the future'),

            url: z.string(),
            textureValue: z.string(),
            textureSignature: z.string(),
          }),
        },
      },
    }, async (_request, reply) => {
      const rawRandomSkinResult = await this.databaseClient.$queryRaw`SELECT url,texture_value,texture_signature,skin_id FROM skin_random_endpoint_get_one();`;

      const randomSkinResult = this.randomSkinSchema.safeParse(rawRandomSkinResult);
      if (randomSkinResult.error) {
        throw new Error('Error parsing random skin from database', { cause: randomSkinResult.error });
      }

      if (randomSkinResult.data.length !== 1) {
        throw Error('Expected exactly one random skin from the database');
      }

      const randomSkin = randomSkinResult.data[0];

      return reply
        .header('Cache-Control', 'private, max-age=0')
        .send({
          url: randomSkin.url,
          textureValue: randomSkin.texture_value,
          textureSignature: randomSkin.texture_signature,
        });
    });
  }
}

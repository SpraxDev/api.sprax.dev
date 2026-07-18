import type { FastifyRequest } from 'fastify';
import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../../constants.js';
import type { FastifyInstanceWithZod } from '../../../../server/FastifyWebServer.js';
import noopValidatorCompiler from '../../../../server/noopValidatorCompiler.js';
import type { default as Router } from '../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class AllCapesRouter implements Router {
  private static readonly GONE_MESSAGE = 'This endpoint was never intended for the general public and only returned the internal IDs ' +
    'used by this API to identify the skins (or null) – Please use one of the other cape endpoints instead';

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v1/capes/all/:nameOrId?', {
      validatorCompiler: noopValidatorCompiler,
      schema: {
        hide: false,
        deprecated: true,
        summary: 'Get all current (and supported) capes for a given player',
        description: AllCapesRouter.GONE_MESSAGE,

        tags: ['Minecraft (v1)'],

        params: z.object({
          nameOrId: z.string().nonempty().describe('UUID or username'),
        }),

        response: {
          410: z.object({ error: z.string(), message: z.string() }),
        },
      },
    }, async (_request: FastifyRequest, reply) => {
      return reply
        .status(410)
        .header('Cache-Control', 'max-age=300, s-maxage=300')
        .send({
          error: 'Gone',
          message: AllCapesRouter.GONE_MESSAGE,
        });
    });
  }
}

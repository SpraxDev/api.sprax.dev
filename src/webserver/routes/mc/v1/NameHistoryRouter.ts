import type { FastifyRequest } from 'fastify';
import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../constants.js';
import type { FastifyInstanceWithZod } from '../../../server/FastifyWebServer.js';
import noopValidatorCompiler from '../../../server/noopValidatorCompiler.js';
import type { default as Router } from '../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class NameHistoryRouter implements Router {
  private static readonly GONE_MESSAGE = 'This endpoint has been removed as Mojang removed the username history API ' +
    '(https://web.archive.org/web/20221006001721/https://help.minecraft.net/hc/en-us/articles/8969841895693-Username-History-API-Removal-FAQ-)';

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v1/history/:user?', {
      validatorCompiler: noopValidatorCompiler,
      schema: {
        hide: false,
        deprecated: true,
        summary: `Get a user's name history (no longer available)`,
        description: NameHistoryRouter.GONE_MESSAGE,
        tags: ['Minecraft (v1)'],

        params: z.object({
          user: z.string(),
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
          message: NameHistoryRouter.GONE_MESSAGE,
        });
    });
  }
}

import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../../../constants.js';
import ServerBlocklistService from '../../../../../../minecraft/server/blocklist/ServerBlocklistService.js';
import type { FastifyInstanceWithZod } from '../../../../../server/FastifyWebServer.js';
import type { default as Router } from '../../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class IndexRouter implements Router {
  constructor(
    private readonly serverBlocklistService: ServerBlocklistService,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v2/server/blocklist', {
      schema: {
        hide: false,
        summary: 'Returns a SHA-1 list of all currently blocked Minecraft servers',
        tags: ['Minecraft (v2)'],

        response: {
          200: z.object({
            hashes: z.array(z.hash('sha1').meta({ example: '8c7122d652cb7be22d1986f1f30b07fd5108d9c0' })),
          }),
        },
      },
    }, async (_request, reply) => {
      const blocklist = await this.serverBlocklistService.provideBlocklist();

      return reply
        .status(200)
        .header('Cache-Control', 'max-age=120, s-maxage=120')
        .send({ hashes: blocklist });
    });
  }
}

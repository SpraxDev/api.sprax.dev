import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../../constants.js';
import ServerBlocklistService from '../../../../../minecraft/server/blocklist/ServerBlocklistService.js';
import type { FastifyInstanceWithZod } from '../../../../server/FastifyWebServer.js';
import type { default as Router } from '../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class BlockedRouter implements Router {
  constructor(
    private readonly serverBlocklistService: ServerBlocklistService,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v1/servers/blocked', {
      schema: {
        hide: false,
        deprecated: true,
        summary: `Get Mojang's server blocklist (SHA1 hashes)`,
        tags: ['Minecraft (v1)'],

        response: {
          200: z.array(z.string()),
        },
      },
    }, async (_request, reply) => {
      const blocklist = await this.serverBlocklistService.provideBlocklist();
      return reply
        .header('Cache-Control', 'max-age=120, s-maxage=120')
        .send(blocklist);
    });
  }
}

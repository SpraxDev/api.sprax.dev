import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../../constants.js';
import ServerBlocklistService from '../../../../../minecraft/server/blocklist/ServerBlocklistService.js';
import type { FastifyInstanceWithZod } from '../../../../server/FastifyWebServer.js';
import type { default as Router } from '../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class BlockedKnownRouter implements Router {
  constructor(
    private readonly serverBlocklistService: ServerBlocklistService,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v1/servers/blocked/known', {
      schema: {
        hide: false,
        deprecated: true,
        summary: 'Get blocked servers with known hostnames (SHA1 hash -> host)',
        tags: ['Minecraft (v1)'],

        response: {
          200: z.record(z.string(), z.string()),
        },
      },
    }, async (_request, reply) => {
      const blocklist = await this.serverBlocklistService.provideBlocklistForKnownHosts();
      const responseBody: { [key: string]: string } = {};
      for (const listEntry of blocklist) {
        if (listEntry.host != null) {
          responseBody[listEntry.sha1.toString('hex')] = listEntry.host;
        }
      }

      return reply
        .header('Cache-Control', 'max-age=120, s-maxage=120')
        .send(responseBody);
    });
  }
}

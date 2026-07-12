import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../../../constants.js';
import ServerBlocklistService from '../../../../../../minecraft/server/blocklist/ServerBlocklistService.js';
import type { FastifyInstanceWithZod } from '../../../../../server/FastifyWebServer.js';
import type { default as Router } from '../../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class DiscoveredRouter implements Router {
  constructor(
    private readonly serverBlocklistService: ServerBlocklistService,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v2/server/blocklist/discovered', {
      schema: {
        hide: false,
        summary: 'Returns all discovered hostnames that are currently on the blocklist',
        tags: ['Minecraft (v2)'],

        response: {
          200: z.object({
            hashes: z
              .record(z.string(), z.string())
              .meta({ example: { '8c7122d652cb7be22d1986f1f30b07fd5108d9c0': '*.example.com' } }),
          }),
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
        .status(200)
        .header('Cache-Control', 'max-age=120, s-maxage=120')
        .send({ hashes: responseBody });
    });
  }
}

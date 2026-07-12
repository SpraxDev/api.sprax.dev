import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../../../constants.js';
import ServerBlocklistService, {
  InvalidHostError,
} from '../../../../../../minecraft/server/blocklist/ServerBlocklistService.js';
import { BadRequestError } from '../../../../../errors/HttpErrors.js';
import type { FastifyInstanceWithZod } from '../../../../../server/FastifyWebServer.js';
import type { default as Router } from '../../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class CheckRouter implements Router {
  constructor(
    private readonly serverBlocklistService: ServerBlocklistService,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v2/server/blocklist/check', {
      schema: {
        hide: false,
        summary: 'Check if a hostname is currently blocked by Mojang',
        description: 'Variations of the given hostname will be generated and checked too.\n' +
          'INFO: The endpoint only accepts valid IPs and Hostnames, but the blocklist does contain Hashes for invalid ones...\n' +
          'If you happen to know one that I am missing, please reach out and I will manually add it to the database <3',
        tags: ['Minecraft (v2)'],

        querystring: z.object({
          host: z.string().nonempty().meta({ example: 'example.com' }),
        }),

        response: {
          200: z.record(z.string(), z.boolean())
            .meta({ example: { 'example.com': false, '*.example.com': false, '*.com': false } }),
          400: z.object({
            error: z.string()
              .meta({ example: 'Expected host to be either an IPv4 address, an IPv6 address or a valid Fully Qualified Domain Name (FQDN)' }),
          }),
        },
      },
    }, async (request, reply) => {
      let blocklist;
      try {
        blocklist = await this.serverBlocklistService.checkBlocklist(request.query.host);
      } catch (err: any) {
        if (err instanceof InvalidHostError) {
          return reply
            .status(400)
            .send(new BadRequestError(err.message).createResponseBody());
        }
        throw err;
      }

      const responseBody: { [key: string]: boolean } = {};
      for (const [host, isBlocked] of blocklist) {
        responseBody[host] = isBlocked;
      }

      return reply
        .status(200)
        .header('Cache-Control', 'max-age=120, s-maxage=120')
        .send(responseBody);
    });
  }
}

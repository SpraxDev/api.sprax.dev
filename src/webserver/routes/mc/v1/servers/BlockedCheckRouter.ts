import type { FastifyRequest } from 'fastify';
import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../../constants.js';
import ServerBlocklistService, {
  InvalidHostError,
} from '../../../../../minecraft/server/blocklist/ServerBlocklistService.js';
import { ApiV1BadRequestError } from '../../../../errors/ApiV1HttpError.js';
import type { FastifyInstanceWithZod } from '../../../../server/FastifyWebServer.js';
import noopValidatorCompiler from '../../../../server/noopValidatorCompiler.js';
import type { default as Router } from '../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class BlockedCheckRouter implements Router {
  constructor(
    private readonly serverBlocklistService: ServerBlocklistService,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v1/servers/blocked/check', {
      validatorCompiler: noopValidatorCompiler,
      schema: {
        hide: false,
        deprecated: true,
        summary: `Check whether a given server address is on Mojang's blocklist`,
        tags: ['Minecraft (v1)'],

        querystring: z.object({
          host: z.string(),
        }),

        response: {
          200: z.record(z.string(), z.boolean()),
        },
      },
    }, async (request: FastifyRequest, reply) => {
      const inputHost = (request.query as any).host as unknown;
      if (typeof inputHost !== 'string' || inputHost.length <= 0) {
        throw ApiV1BadRequestError.missingOrInvalidQueryParameter('host', 'host.length > 0');
      }

      let blocklist;
      try {
        blocklist = await this.serverBlocklistService.checkBlocklist(inputHost);
      } catch (err: any) {
        if (err instanceof InvalidHostError) {
          throw ApiV1BadRequestError.missingOrInvalidQueryParameter('host', 'A valid IPv4, IPv6 or domain');
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

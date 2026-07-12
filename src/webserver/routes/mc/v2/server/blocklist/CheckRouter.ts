import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../../../constants.js';
import ServerBlocklistService, {
  InvalidHostError,
} from '../../../../../../minecraft/server/blocklist/ServerBlocklistService.js';
import { BadRequestError } from '../../../../../errors/HttpErrors.js';
import type { FastifyInstanceWithZod } from '../../../../../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from '../../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class CheckRouter implements Router {
  constructor(
    private readonly serverBlocklistService: ServerBlocklistService,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v2/server/blocklist/check', {
      schema: {
        querystring: z.object({
          host: z.string().nonempty(),
        }),
      },
    }, async (request, reply): Promise<RouteReturn> => {
      let blocklist;
      try {
        blocklist = await this.serverBlocklistService.checkBlocklist(request.query.host);
      } catch (err: any) {
        if (err instanceof InvalidHostError) {
          throw new BadRequestError(err.message);
        }
        throw err;
      }

      const responseBody: { [key: string]: boolean } = {};
      for (const [host, isBlocked] of blocklist) {
        responseBody[host] = isBlocked;
      }

      return reply
        .header('Cache-Control', 'max-age=120, s-maxage=120')
        .send(responseBody);
    });
  }
}

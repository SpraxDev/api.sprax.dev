import { injectable } from 'tsyringe';
import { ContainerTokens } from '../../../../../../constants.js';
import ServerBlocklistService from '../../../../../../minecraft/server/blocklist/ServerBlocklistService.js';
import type { FastifyInstanceWithZod } from '../../../../../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from '../../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class IndexRouter implements Router {
  constructor(
    private readonly serverBlocklistService: ServerBlocklistService,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v2/server/blocklist', async (_request, reply): Promise<RouteReturn> => {
      const blocklist = await this.serverBlocklistService.provideBlocklist();
      return reply
        .header('Cache-Control', 'max-age=120, s-maxage=120')
        .send({ hashes: blocklist });
    });
  }
}

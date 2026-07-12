import { injectable } from 'tsyringe';
import { ContainerTokens } from '../../../../../../constants.js';
import type { FastifyInstanceWithZod } from '../../../../../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from '../../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class HistoryRouter implements Router {
  register(server: FastifyInstanceWithZod): void {
    // TODO: Add this endpoint to the OpenAPI spec file
    server.get('/mc/v2/server/blocklist/history', async (_request, reply): Promise<RouteReturn> => {
      // TODO: The recorded history of the block list + discovered hash value (nullable) + timestamp of discovery

      // .header('Cache-Control', 'max-age=600, s-maxage=600')
      return reply
        .status(501)
        .send({ error: 'Not Implemented (yet)' });
    });
  }
}

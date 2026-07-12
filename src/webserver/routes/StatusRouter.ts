import { injectable } from 'tsyringe';
import { ContainerTokens } from '../../constants.js';
import { type FastifyInstanceWithZod } from '../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from './Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class StatusRouter implements Router {
  register(server: FastifyInstanceWithZod): void {
    server.get('/status', (_request, reply): RouteReturn => {
      return reply.send({ online: true });
    });
  }
}

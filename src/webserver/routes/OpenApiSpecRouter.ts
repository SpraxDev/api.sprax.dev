import { injectable } from 'tsyringe';
import { ContainerTokens } from '../../constants.js';
import type { FastifyInstanceWithZod } from '../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from './Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class OpenApiSpecRouter implements Router {
  register(server: FastifyInstanceWithZod): void {
    server.get('/openapi.json', (_request, reply): RouteReturn => {
      return reply.send(JSON.stringify(server.swagger(), null, 2) + '\n');
    });

    server.get('/openapi.yaml', (_request, reply): RouteReturn => {
      return reply
        .type('application/yaml')
        .send(server.swagger({ yaml: true }));
    });
  }
}

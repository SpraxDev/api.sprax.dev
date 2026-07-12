import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../constants.js';
import { type FastifyInstanceWithZod } from '../server/FastifyWebServer.js';
import type { default as Router } from './Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class StatusRouter implements Router {
  register(server: FastifyInstanceWithZod): void {
    server.get('/status', {
      schema: {
        hide: false,
        summary: 'Check if the API is online/responding',
        tags: ['Miscellaneous'],

        operationId: 'getApiStatus',
        response: {
          200: z.object({ online: z.boolean() }),
        },
      },
    }, () => {
      return { online: true };
    });
  }
}

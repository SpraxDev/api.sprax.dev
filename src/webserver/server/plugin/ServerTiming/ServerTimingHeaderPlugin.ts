import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { fastifyPlugin } from 'fastify-plugin';
import { IS_PRODUCTION } from '../../../../constants.js';
import ServerTiming from './ServerTiming.js';

declare module 'fastify' {
  interface FastifyReply {
    serverTiming?: ServerTiming;
  }
}

export default fastifyPlugin(registerPlugin);

function registerPlugin(instance: FastifyInstance, _opts: FastifyPluginOptions, done: (err?: Error) => void): void {
  instance.decorateReply('serverTiming');

  instance.addHook('onRequest', (_request, reply, done): void => {
    if (!IS_PRODUCTION) {
      reply.serverTiming = new ServerTiming();
    }
    done();
  });

  instance.addHook('onSend', (_request, reply, _payload: unknown, done): void => {
    reply.serverTiming?.setHttpHeader(reply);
    done();
  });

  done();
}

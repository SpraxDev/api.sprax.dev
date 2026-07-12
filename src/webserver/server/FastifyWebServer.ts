import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import * as FastifyTypeProviderZod from 'fastify-type-provider-zod';
import { injectAll, singleton } from 'tsyringe';
import { ContainerTokens } from '../../constants.js';
import Metrics from '../../metrics/Metrics.js';
import { HttpError } from '../errors/HttpErrors.js';
import type Router from '../routes/Router.js';
import NotFoundHandlerPlugin from './plugin/NotFoundHandlerPlugin.js';
import ServerTimingHeaderPlugin from './plugin/ServerTiming/ServerTimingHeaderPlugin.js';

export type FastifyInstanceWithZod = Fastify.FastifyInstance<
  Fastify.RawServerDefault,
  Fastify.RawRequestDefaultExpression,
  Fastify.RawReplyDefaultExpression,
  Fastify.FastifyBaseLogger,
  FastifyTypeProviderZod.ZodTypeProvider
>;

@singleton()
export default class FastifyWebServer {
  private readonly fastify: FastifyInstanceWithZod;

  constructor(
    @injectAll(ContainerTokens.ROUTER) routers: Router[],
    private readonly metrics: Metrics,
  ) {
    this.fastify = Fastify({
      routerOptions: {
        ignoreDuplicateSlashes: true,
        ignoreTrailingSlash: true,
      },

      trustProxy: false, // FIXME
    });

    this.fastify.register(ServerTimingHeaderPlugin);

    this.registerErrorHandler();
    this.fastify.register(NotFoundHandlerPlugin);

    this.fastify.setValidatorCompiler(FastifyTypeProviderZod.validatorCompiler);
    this.fastify.setSerializerCompiler(FastifyTypeProviderZod.serializerCompiler);

    this.registerDefaultHeaders();
    this.registerMetricsCollection();
    this.setupRouters(routers);
  }

  async listen(host: string, port: number): Promise<void> {
    await this.fastify.listen({ host, port });
  }

  async shutdown(): Promise<void> {
    await this.fastify.close();
  }

  private registerErrorHandler(): void {
    this.fastify.setErrorHandler((err: Error, _req: FastifyRequest, reply: FastifyReply): FastifyReply => {
      if (err instanceof HttpError) {
        return reply
          .status(err.httpStatusCode)
          .send(err.createResponseBody());
      }

      if ((err as any).code === 'FST_ERR_VALIDATION') {
        const responseBody = {
          error: 'Request validation failed',
          validation: {
            context: (err as any).validationContext,
            errors: (err as any).validation,
          },
        };

        return reply
          .status(400)
          .type('application/json; charset=utf-8')
          .send(JSON.stringify(responseBody) + '\n');
      }

      console.error(err);
      return reply
        .status(500)
        .send({ error: 'Internal Server Error' });
    });
  }

  private registerDefaultHeaders(): void {
    this.fastify.addHook('onRequest', (_request: FastifyRequest, reply: FastifyReply, done: Fastify.HookHandlerDoneFunction): void => {
      reply
        .header('X-Powered-By', 'fastify')

        .header('Content-Security-Policy', `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none';`)
        .header('Cross-Origin-Opener-Policy', 'same-origin')
        .header('X-Frame-Options', 'DENY')
        .header('X-Content-Type-Options', 'nosniff')

        .header('Access-Control-Allow-Origin', '*')
        .header('Access-Control-Expose-Headers', 'Age');
      done();
    });
  }

  private registerMetricsCollection(): void {
    this.fastify.addHook('onResponse', (request: FastifyRequest, reply: FastifyReply, done: Fastify.HookHandlerDoneFunction): void => {
      if (!['/metrics', '/status', '/favicon.ico'].includes(request.originalUrl)) {
        this.metrics.collectIncomingHttpRequest(request.method, reply.statusCode);
      }
      done();
    });
  }

  private setupRouters(routers: Router[]): void {
    for (const router of routers) {
      this.fastify.register((instance, options) => {
        router.register(instance, options);
      }, { prefix: router.getRoutePrefix?.() });
    }
  }
}

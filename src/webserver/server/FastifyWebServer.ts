import FastifySwaggerPlugin from '@fastify/swagger';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import * as FastifyTypeProviderZod from 'fastify-type-provider-zod';
import { injectAll, singleton } from 'tsyringe';
import { ContainerTokens, getAppInfo } from '../../constants.js';
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

    // TODO: Can we delcare our own plugin or something that registers this one or something?
    //       At least move the registration and config in a private method
    // TODO: Maybe make the OpenAPI-Spec opt-in, so other installations (that do not exist)
    //       do not automatically expose information that is incorrect for that installation (servers, contact, etc.)
    this.fastify.register(FastifySwaggerPlugin, {
      transform: (ctx) => {
        const transformed = FastifyTypeProviderZod.jsonSchemaTransform(ctx);
        transformed.schema = { ...transformed.schema, hide: ctx.schema?.hide ?? true };

        // remove optional parameter '?' indicator that otherwise produces invalid path specs
        transformed.url = transformed.url.replace(/\?$/, '');
        return transformed;
      },

      openapi: {
        openapi: '3.1.0',

        info: {
          title: `Sprax's public Minecraft APIs`,
          version: getAppInfo().version,
          description: '!!! **Set a proper User-Agent header, when using this API** !!!\n\n' +
            '**API stability**: Endpoints documented here can generally be considered stable and "public".\n' +
            'But error response bodies are not stable right now and may change from time-to-time (But documented status codes are stable).\n\n' +
            '**Rate-Limiting:** There are plans to rate limit generic User-Agents, to encourage active users to set a custom one. ' +
            'Please include *some* version in your User-Agent, as I may block abusive looking ones and hope for an update that improves on that. ' +
            'You may optionally provide a URL or way of contact in the User-Agent and I will try to reach out beforehand in that case ^^\n\n' +
            '**You are using my API in your project?** Let me know <3',
          license: {
            name: 'GNU General Public License v3.0 or later',
            identifier: 'GPL-3.0-or-later',
          },
          contact: {
            name: 'Christian Koop',
            url: 'https://github.com/SpraxDev',
          },
        },

        servers: [
          { url: 'https://api.sprax.dev/' },
          {
            url: 'https://api.sprax2013.de/',
            description: 'DEPRECATED (Backwards compatibility mode; remove /mc/v1/ from paths)',
          },
        ],

        tags: [
          { name: 'Minecraft (v2)', description: 'Work In Progress – Definition subject to change' },
          { name: 'Minecraft (v1)', description: 'Will be replaced by the v2 endpoints' },
          { name: 'Miscellaneous', description: 'Other endpoints' },
        ],
      },
    });

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
        .header('Cross-Origin-Resource-Policy', 'cross-origin')
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

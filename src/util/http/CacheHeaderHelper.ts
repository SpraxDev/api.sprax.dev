import type { FastifyReply } from 'fastify';
import { singleton } from 'tsyringe';

type CacheHeaderOptions = {
  baseCacheDuration: number,
  age?: number,
  immutable?: boolean,
};

@singleton()
export default class CacheHeaderHelper {
  forPublic(reply: FastifyReply, options: CacheHeaderOptions): void {
    if (options.age != null) {
      reply.header('Age', Math.floor(options.age).toString());
    }

    let cacheDuration = options.baseCacheDuration;
    if (options.age != null && options.age > options.baseCacheDuration) {
      cacheDuration = Math.floor(options.age) + 10;
    }

    const cacheControl = `max-age=${cacheDuration}, s-maxage=${cacheDuration}${options.immutable ? ', immutable' : ''}`;
    reply.header('Cache-Control', cacheControl);
  }
}

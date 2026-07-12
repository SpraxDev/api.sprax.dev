import Net from 'node:net';
import { injectable } from 'tsyringe';
import z from 'zod';
import { ContainerTokens } from '../../../../../constants.js';
import MinecraftServerStatusService from '../../../../../minecraft/server/ping/MinecraftServerStatusService.js';
import CacheHeaderHelper from '../../../../../util/http/CacheHeaderHelper.js';
import type { FastifyInstanceWithZod } from '../../../../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from '../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class PingRouter implements Router {
  private static readonly MINECRAFT_DEFAULT_PORT = 25565 as const;

  constructor(
    private readonly minecraftServerStatusService: MinecraftServerStatusService,
    private readonly cacheHeaderHelper: CacheHeaderHelper,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/mc/v2/server/ping', {
      schema: {
        querystring: z.object({
          host: z.string()
            .nonempty()
            .refine((val) => {
              if (Net.isIP(val) > 0) {
                return true;
              }
              return !val.includes(':');
            }, { error: 'Invalid host – use the "port" query parameter to specify a port' }),
          port: z.coerce.number().int()
            .min(1)
            .max(65535)
            .optional()
            .default(PingRouter.MINECRAFT_DEFAULT_PORT),
        }),
      },
    }, async (request, reply): Promise<RouteReturn> => {
      const serverStatus = await this.minecraftServerStatusService.provideServerStatus(request.query.host, request.query.port);

      this.cacheHeaderHelper.forPublic(reply, { baseCacheDuration: 30, age: serverStatus.ageInSeconds });

      if (serverStatus.serverStatus != null) {
        return reply
          .send(serverStatus.serverStatus);
      }

      // FIXME: Unify success and "error" response content/layout
      return reply
        .status(200)
        .send({ online: false });
    });
  }
}

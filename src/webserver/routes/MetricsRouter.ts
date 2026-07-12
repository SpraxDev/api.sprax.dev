import { injectable } from 'tsyringe';
import { ContainerTokens } from '../../constants.js';
import Metrics from '../../metrics/Metrics.js';
import { type FastifyInstanceWithZod } from '../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from './Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class MetricsRouter implements Router {
  constructor(
    private readonly metrics: Metrics,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/metrics', (_request, reply): RouteReturn => {
      return reply
        .header('Cache-Control', 'no-cache')
        .type('text/plain; version=0.0.4; charset=utf-8')
        .send(this.metrics.toPrometheusMetrics());
    });
  }
}

import * as Sentry from '@sentry/node';
import { getAppInfo, IS_PRODUCTION } from './constants.js';
import { HttpError } from './webserver/errors/HttpErrors.js';

(() => {
  const dsn = process.env.SENTRY_DSN ?? '';
  delete process.env.SENTRY_DSN;

  if (dsn === '') {
    console.warn('Sentry DSN is not configured – skipping Sentry initialization');
    return;
  }

  const appInfo = getAppInfo();
  Sentry.init({
    dsn,
    environment: IS_PRODUCTION ? 'production' : 'development',
    release: `${appInfo.name}@${appInfo.version}`,

    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
        response: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      },
      httpBodies: [],
      urlQueryParams: true,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      graphQL: { document: false, variables: false },
    },

    maxBreadcrumbs: 50,
    tracePropagationTargets: [],

    integrations: [
      Sentry.fastifyIntegration({
        shouldHandleError(err): boolean {
          if (err instanceof HttpError) {
            return err.httpStatusCode >= 500;
          }
          return (err as { code?: string }).code !== 'FST_ERR_VALIDATION';
        },
      }),
    ],
  });
})();

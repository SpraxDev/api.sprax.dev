import type * as PrismaClient from '../../../database/prisma-client/client.js';
import UUID from '../../../util/UUID.js';
import BulkImporter from './BulkImporter.js';

export default class UuidBulkImporter implements BulkImporter {
  isValidPayload(payload: string): true | string {
    if (UUID.looksLikeUuid(payload)) {
      return true;
    }
    return `Invalid UUID: ${JSON.stringify(payload)}`;
  }

  createTasks(payload: string, importGroupId: bigint): PrismaClient.Prisma.ImportTaskCreateManyInput[] {
    return [{
      payload: Buffer.from(UUID.normalize(payload)),
      payloadType: 'UUID',
      importGroupId,
    }];
  }
}

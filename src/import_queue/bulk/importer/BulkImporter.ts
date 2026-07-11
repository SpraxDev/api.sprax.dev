import type * as PrismaClient from '../../../database/prisma-client/client.js';

export default interface BulkImporter {
  isValidPayload(payload: string): true | string | Promise<true | string>;

  createTasks(payload: string, importGroupId: bigint): PrismaClient.Prisma.ImportTaskCreateManyInput[]|Promise<PrismaClient.Prisma.ImportTaskCreateManyInput[]>;
}

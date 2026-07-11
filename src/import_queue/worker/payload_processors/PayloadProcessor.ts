import type * as PrismaClient from '../../../database/prisma-client/client.js';

export default interface PayloadProcessor {
  /**
   * @returns false, if not changes have been made/written
   */
  process(task: PrismaClient.ImportTask): Promise<boolean>;
}

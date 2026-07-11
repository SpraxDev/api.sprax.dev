import type * as PrismaClient from '../../../database/prisma-client/client.js';
import { singleton } from 'tsyringe';
import MinecraftProfileCache from '../../../minecraft/profile/MinecraftProfileCache.js';
import MinecraftProfileService from '../../../minecraft/profile/MinecraftProfileService.js';
import ByteUtils from '../../../util/ByteUtils.js';
import PayloadProcessor from './PayloadProcessor.js';

@singleton()
export default class UuidProcessor implements PayloadProcessor {
  constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly minecraftProfileCache: MinecraftProfileCache,
  ) {
  }

  async process(task: PrismaClient.ImportTask | string): Promise<boolean> {
    const uuid = typeof task === 'string' ? task : ByteUtils.toBuffer(task.payload).toString('utf-8');
    if (uuid.length !== 32) {
      throw new Error('Invalid UUID (hyphens are not allowed)');
    }

    const alreadyKnowUuid = await this.minecraftProfileCache.findByUuid(uuid) != null;

    const profile = await this.minecraftProfileService.provideProfileByUuid(uuid);
    return !alreadyKnowUuid && profile != null;
  }
}

import { singleton } from 'tsyringe';
import type * as PrismaClient from '../../../database/prisma-client/client.js';
import SkinPersister from '../../../minecraft/persistance/base/SkinPersister.js';
import MinecraftSkinNormalizer from '../../../minecraft/skin/manipulator/MinecraftSkinNormalizer.js';
import SkinImageManipulator from '../../../minecraft/skin/manipulator/SkinImageManipulator.js';
import MinecraftSkinCache from '../../../minecraft/skin/MinecraftSkinCache.js';
import ByteUtils from '../../../util/ByteUtils.js';
import PayloadProcessor from './PayloadProcessor.js';

@singleton()
export default class SkinImageProcessor implements PayloadProcessor {
  constructor(
    private readonly minecraftSkinCache: MinecraftSkinCache,
    private readonly minecraftSkinNormalizer: MinecraftSkinNormalizer,
    private readonly skinPersister: SkinPersister,
  ) {
  }

  async process(task: PrismaClient.ImportTask): Promise<boolean> {
    const skinImage = ByteUtils.toBuffer(task.payload);

    if (await this.minecraftSkinCache.existsByImageBytes(skinImage)) {
      return false;
    }

    const originalSkin = await SkinImageManipulator.createByImage(skinImage);
    const normalizedSkin = await this.minecraftSkinNormalizer.normalizeSkin(originalSkin);

    await this.skinPersister.persist(skinImage, await normalizedSkin.toPngBuffer(), null);
    return true;
  }
}

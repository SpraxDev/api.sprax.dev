import type * as PrismaClient from '../../database/prisma-client/client.js';

export enum CapeType {
  MOJANG = 'MOJANG',
  OPTIFINE = 'OPTIFINE',
  LABYMOD = 'LABYMOD'
}

export const CAPE_TYPE_STRINGS: string[] = [
  CapeType.MOJANG,
  CapeType.OPTIFINE,
  CapeType.LABYMOD,
] satisfies PrismaClient.CapeType[];

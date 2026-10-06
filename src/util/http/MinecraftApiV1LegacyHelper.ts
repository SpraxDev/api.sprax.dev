import { singleton } from 'tsyringe';
import type { Profile } from '../../minecraft/profile/MinecraftProfileService.js';
import { ApiV1BadRequestError } from '../../webserver/errors/ApiV1HttpError.js';
import UUID from '../UUID.js';
import MinecraftProfileByNameOrIdProvider from './MinecraftProfileByNameOrIdProvider.js';

@singleton()
export default class MinecraftApiV1LegacyHelper {
  constructor(
    private readonly minecraftProfileByNameOrIdProvider: MinecraftProfileByNameOrIdProvider,
  ) {
  }

  provideProfileByNameOrId(inputNameOrId: unknown): Promise<Profile | null> {
    if (typeof inputNameOrId !== 'string' || inputNameOrId.length <= 0) {
      throw ApiV1BadRequestError.missingOrInvalidUrlParameter('user', 'user.length > 0');
    }
    if (inputNameOrId.length > 16 && !UUID.looksLikeUuid(inputNameOrId)) {
      throw ApiV1BadRequestError.missingOrInvalidUrlParameter('user', 'Is valid uuid string or user.length <= 16');
    }

    return this.minecraftProfileByNameOrIdProvider.provide(inputNameOrId);
  }

  /**
   * @throws ApiV1BadRequestError
   */
  parseBoolean(input: unknown): boolean | null {
    if (input == null) {
      return null;
    }

    if (input !== '1' && input !== '0' && input !== 'true' && input !== 'false') {
      throw new ApiV1BadRequestError(`Expected a "1", "0", "true" or "false" but got ${JSON.stringify(input)}`);
    }
    return input === '1' || input === 'true';
  }

  /**
   * @throws ApiV1BadRequestError
   */
  parseSize(input: unknown): number | null {
    if (input == null) {
      return null;
    }

    if (typeof input !== 'string' || !/^\d+$/.test(input)) {
      throw ApiV1BadRequestError.missingOrInvalidQueryParameter('size', 'size >= 8 and size <= 1024');
    }

    const result = Number.parseInt(input, 10);
    if (result < 8 || result > 1024) {
      throw ApiV1BadRequestError.missingOrInvalidQueryParameter('size', 'size >= 8 and size <= 1024');
    }
    return result;
  }
}

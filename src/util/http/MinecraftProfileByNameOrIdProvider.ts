import { singleton } from 'tsyringe';
import UUID from '../UUID.js';
import { BadRequestError } from '../../webserver/errors/HttpErrors.js';
import MinecraftProfileService, { type Profile } from '../../minecraft/profile/MinecraftProfileService.js';

@singleton()
export default class MinecraftProfileByNameOrIdProvider {
  constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
  ) {
  }

  /**
   * @throws BadRequestError
   */
  provide(nameOrId: string): Promise<Profile | null> {
    if (this.looksLikeUsername(nameOrId)) {
      return this.minecraftProfileService.provideProfileByUsername(nameOrId);
    }
    if (UUID.looksLikeUuid(nameOrId)) {
      return this.minecraftProfileService.provideProfileByUuid(nameOrId);
    }

    throw new BadRequestError('Invalid username or UUID');
  }

  private looksLikeUsername(nameOrId: string): boolean {
    return nameOrId.length <= 16;
  }
}

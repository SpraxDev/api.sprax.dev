import type { FastifyRequest } from 'fastify';
import { injectable } from 'tsyringe';
import { ContainerTokens } from '../../../constants.js';
import ResolvedToNonUnicastIpError from '../../../http/dns/errors/ResolvedToNonUnicastIpError.js';
import type ImageManipulator from '../../../minecraft/image/ImageManipulator.js';
import { type Profile } from '../../../minecraft/profile/MinecraftProfileService.js';
import MinecraftSkinCache from '../../../minecraft/skin/MinecraftSkinCache.js';
import MinecraftSkinService, {
  Skin,
  SkinRequestFailedException,
} from '../../../minecraft/skin/MinecraftSkinService.js';
import MinecraftSkinTypeDetector from '../../../minecraft/skin/MinecraftSkinTypeDetector.js';
import SkinImage2DRenderer from '../../../minecraft/skin/renderer/SkinImage2DRenderer.js';
import MinecraftProfile from '../../../minecraft/value-objects/MinecraftProfile.js';
import MinecraftProfileTextures from '../../../minecraft/value-objects/MinecraftProfileTextures.js';
import MinecraftProfileByNameOrIdProvider from '../../../util/http/MinecraftProfileByNameOrIdProvider.js';
import { BadRequestError, NotFoundError } from '../../errors/HttpErrors.js';
import type { FastifyInstanceWithZod } from '../../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from '../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class MinecraftV2Router implements Router {
  constructor(
    private readonly minecraftProfileByNameOrIdProvider: MinecraftProfileByNameOrIdProvider,
    private readonly minecraftSkinService: MinecraftSkinService,
    private readonly minecraftSkinTypeDetector: MinecraftSkinTypeDetector,
    private readonly skinImage2DRenderer: SkinImage2DRenderer,
    private readonly minecraftSkinCache: MinecraftSkinCache,
  ) {
  }

  getRoutePrefix(): string {
    return '/mc/v2/';
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/skin/x-url/:skinArea?', async (request, reply): Promise<RouteReturn> => {
      const skinUrl = (request.query as any).url;
      if (typeof skinUrl !== 'string' || skinUrl.length <= 0) {
        throw new BadRequestError('Missing or invalid url parameters');
      }

      let parsedSkinUrl: URL;
      try {
        parsedSkinUrl = new URL(skinUrl);
      } catch (err: any) {
        throw new BadRequestError(`Invalid URL provided`);
      }

      if (parsedSkinUrl.protocol !== 'https:') {
        throw new BadRequestError(`Only HTTPS URLs are supported`);
      }

      // TODO: Cache the response (try to respect the Cache-Control header but enforce a minimum cache time and set a maximum cache time of one month)
      // TODO: Properly handle errors when requesting the skin (check content-type?)

      let skin: Skin | null = null;
      if (MinecraftProfileTextures.isOfficialTextureUrl(parsedSkinUrl.href)) {
        skin = await this.minecraftSkinCache.findByUrl(parsedSkinUrl.href);
      }

      if (skin == null) {
        try {
          skin = await this.minecraftSkinService.fetchAndPersistSkin(parsedSkinUrl.href);
        } catch (err: any) {
          if (err instanceof ResolvedToNonUnicastIpError) {
            throw new BadRequestError(`Failed to fetch skin from URL, it does not resolve to a public IP address`);
          }
          if (err instanceof SkinRequestFailedException) {
            throw new BadRequestError(`Failed to fetch skin from URL, got status code ${err.httpStatusCode}`);
          }
          throw err;
        }
      }

      const renderSlim = this.parseBoolean((request.query as any).slim) ?? this.minecraftSkinTypeDetector.detect(skin.normalized) === 'alex';
      const skinResponse = await this.processSkinRequest(request, skin, renderSlim);

      reply.header('Content-Type', 'image/png');
      if (skinResponse.forceDownload) {
        reply.header('Content-Disposition', `attachment; filename="x-url${skinResponse.skinArea != null ? `-${skinResponse.skinArea}` : ''}.png"`);
        reply.header('Content-Type', 'application/octet-stream');
      }

      return reply
        // .header('Age', Math.floor(profile.ageInSeconds).toString())
        .header('Cache-Control', 'max-age=60, s-maxage=60, immutable')
        .send(skinResponse.pngBody);
    });

    server.get('/skin/:user/:skinArea?', async (request, reply): Promise<RouteReturn> => {
      const profile = await this.resolveUserToProfile((request.params as any).user);
      if (profile == null) {
        reply.header('Cache-Control', 'max-age=60, s-maxage=60');
        throw new NotFoundError(`Unable to find a profile for the given UUID or username`);
      }
      const minecraftProfile = new MinecraftProfile(profile.profile);

      const renderSlim = this.parseBoolean((request.query as any).slim) ?? minecraftProfile.parseTextures()?.slimPlayerModel ?? minecraftProfile.determineDefaultSkin() === 'alex';
      const skin = await this.minecraftSkinService.fetchEffectiveSkin(new MinecraftProfile(profile.profile));

      const skinResponse = await this.processSkinRequest(request, skin, renderSlim);

      reply.header('Content-Type', 'image/png');
      if (skinResponse.forceDownload) {
        reply.header('Content-Disposition', `attachment; filename="${profile.profile.name}${skinResponse.skinArea != null ? `-${skinResponse.skinArea}` : ''}.png"`);
        reply.header('Content-Type', 'application/octet-stream');
      }

      return reply
        .header('Age', Math.floor(profile.ageInSeconds).toString())
        .header('Cache-Control', 'max-age=60, s-maxage=60, immutable')
        .send(skinResponse.pngBody);
    });
  }

  private async resolveUserToProfile(inputUser: unknown): Promise<Profile | null> {
    if (typeof inputUser !== 'string') {
      throw new BadRequestError('Invalid username or UUID');
    }
    return this.minecraftProfileByNameOrIdProvider.provide(inputUser);
  }

  private async processSkinRequest(request: FastifyRequest, skin: Skin, renderSlim: boolean): Promise<{ pngBody: Buffer, skinArea: 'head' | 'body' | null, forceDownload: boolean }> {
    function parseSkinArea(input: unknown): 'head' | 'body' | null {
      if (input == null) {
        return null;
      }

      if (input !== 'head' && input !== 'body') {
        throw new BadRequestError(`Only supports "head" or "body" as skin area but got ${JSON.stringify(input)}`);
      }
      return input;
    }

    function parseInteger(input: unknown): number | null {
      if (input == null) {
        return null;
      }

      if (typeof input !== 'string' || !/^\d+$/.test(input)) {
        throw new BadRequestError(`Expected a number but got ${JSON.stringify(input)}`);
      }

      const result = Number.parseInt(input, 10);
      if (Number.isFinite(result)) {
        return result;
      }
      throw new BadRequestError(`Expected a number but got ${JSON.stringify(input)}`);
    }

    const userInputOverlay = (request.query as any).overlay;
    const userInputSlim = (request.query as any).slim;
    const userInputSize = (request.query as any).size;

    const requestedSkinArea = parseSkinArea((request.params as any).skinArea);
    if (userInputOverlay != null && requestedSkinArea == null) {
      throw new BadRequestError('Cannot use "overlay" when just requesting the skin file (without "skinArea" or "3d")');
    }
    if (userInputSize != null && requestedSkinArea == null) {
      throw new BadRequestError('Cannot use "size" when just requesting the skin file (without "skinArea" or "3d")');
    }
    if (userInputSlim != null && requestedSkinArea == null) {
      throw new BadRequestError('Cannot use "slim" when just requesting the skin file (without "skinArea" or "3d")');
    }
    if (userInputSlim != null && requestedSkinArea === 'head') {
      throw new BadRequestError('Cannot use "slim" when requesting the rendered head');
    }

    const renderOverlay = this.parseBoolean(userInputOverlay) ?? true;
    const renderSize = parseInteger(userInputSize) ?? 512;
    const forceDownload = this.parseBoolean((request.query as any).download) ?? false;

    if (renderSize != null && (renderSize < 8 || renderSize > 1024)) {
      throw new BadRequestError('Size must be between 8 and 1024');
    }

    let responseSkin: ImageManipulator = skin.original;

    if (requestedSkinArea === 'head') {
      responseSkin = await this.skinImage2DRenderer.extractHead(skin.original, renderOverlay);
    } else if (requestedSkinArea === 'body') {
      responseSkin = await this.skinImage2DRenderer.extractBody(skin.original, renderOverlay, renderSlim);
    }

    const responseResizeOptions = responseSkin === skin.original ? undefined : { width: renderSize, height: renderSize };
    const responseBody = await responseSkin.toPngBuffer(responseResizeOptions);

    return {
      pngBody: responseBody,
      skinArea: requestedSkinArea,
      forceDownload,
    };
  }

  private parseBoolean(input: unknown): boolean | null {
    if (input == null) {
      return null;
    }

    if (input !== '1' && input !== '0' && input !== 'true' && input !== 'false') {
      throw new BadRequestError(`Expected a "1", "0", "true" or "false" but got ${JSON.stringify(input)}`);
    }
    return input === '1' || input === 'true';
  }
}

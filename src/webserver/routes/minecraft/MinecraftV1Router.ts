import type { FastifyRequest } from 'fastify';
import assert from 'node:assert';
import https from 'node:http';
import Sharp from 'sharp';
import { injectable } from 'tsyringe';
import { ContainerTokens } from '../../../constants.js';
import ResolvedToNonUnicastIpError from '../../../http/dns/errors/ResolvedToNonUnicastIpError.js';
import ImageManipulator from '../../../minecraft/image/ImageManipulator.js';
import MinecraftProfileService, { Profile } from '../../../minecraft/profile/MinecraftProfileService.js';
import SkinImageManipulator from '../../../minecraft/skin/manipulator/SkinImageManipulator.js';
import MinecraftSkinCache from '../../../minecraft/skin/MinecraftSkinCache.js';
import MinecraftSkinService, {
  Skin,
  SkinRequestFailedException,
} from '../../../minecraft/skin/MinecraftSkinService.js';
import MinecraftSkinTypeDetector from '../../../minecraft/skin/MinecraftSkinTypeDetector.js';
import LegacyMinecraft3DRenderer from '../../../minecraft/skin/renderer/LegacyMinecraft3DRenderer.js';
import SkinImage2DRenderer from '../../../minecraft/skin/renderer/SkinImage2DRenderer.js';
import MinecraftProfile from '../../../minecraft/value-objects/MinecraftProfile.js';
import MinecraftProfileTextures from '../../../minecraft/value-objects/MinecraftProfileTextures.js';
import UUID from '../../../util/UUID.js';
import { ApiV1BadRequestError, ApiV1NotFoundError } from '../../errors/ApiV1HttpError.js';
import { type FastifyInstanceWithZod } from '../../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from '../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class MinecraftV1Router implements Router {
  constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly minecraftSkinService: MinecraftSkinService,
    private readonly minecraftSkinCache: MinecraftSkinCache,
    private readonly skinImage2DRenderer: SkinImage2DRenderer,
    private readonly minecraftSkinTypeDetector: MinecraftSkinTypeDetector,
    private readonly legacyMinecraft3DRenderer: LegacyMinecraft3DRenderer,
  ) {
  }

  getRoutePrefix(): string {
    return '/mc/v1/';
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/skin/x-url/:skinArea?', async (request, reply): Promise<RouteReturn> => {
      const skinUrl = (request.query as any).url;
      if (typeof skinUrl !== 'string' || skinUrl.length <= 0) {
        throw ApiV1BadRequestError.missingOrInvalidQueryParameter('url', 'url.length > 0');
      }

      let parsedSkinUrl: URL;
      try {
        parsedSkinUrl = new URL(skinUrl);
      } catch (err: any) {
        throw ApiV1BadRequestError.missingOrInvalidQueryParameter('url', 'url needs to be a valid URL (e.g. start with https://)');
      }

      if (parsedSkinUrl.protocol !== 'https:') {
        throw ApiV1BadRequestError.missingOrInvalidQueryParameter('url', 'url needs to be an https URL');
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
            throw ApiV1BadRequestError.missingOrInvalidQueryParameter('url', 'url needs to point to a public IP address');
          }
          if (err instanceof SkinRequestFailedException) {
            throw new ApiV1BadRequestError(`Provided URL returned ${err.httpStatusCode} (${https.STATUS_CODES[err.httpStatusCode]})`);
          }
          throw err;
        }
      }

      const requestedRawSkin = this.parseBoolean((request.query as any).raw) ?? false;
      const renderSlim = this.parseBoolean((request.query as any).slim) ?? this.minecraftSkinTypeDetector.detect(skin.normalized) === 'alex';

      const skinResponse = await this.processSkinRequest(request, skin, renderSlim, requestedRawSkin);

      reply.header('Content-Type', 'image/png');
      if (skinResponse.forceDownload) {
        reply.header('Content-Disposition', `attachment; filename="x-url${skinResponse.skinArea != null ? `-${skinResponse.skinArea}` : ''}.png"`);
        reply.header('Content-Type', 'application/octet-stream');
      }

      return reply
        // .header('Age', Math.floor(profile.ageInSeconds).toString())
        .header('Cache-Control', this.createCacheControlHeaderWithImmutable(60))
        .send(skinResponse.pngBody);
    });

    server.get('/skin/x-url/:skinArea/3d', async (request, reply): Promise<RouteReturn> => {
      const skinUrl = (request.query as any).url;
      if (typeof skinUrl !== 'string' || skinUrl.length <= 0) {
        throw ApiV1BadRequestError.missingOrInvalidQueryParameter('url', 'url.length > 0');
      }

      let parsedSkinUrl: URL;
      try {
        parsedSkinUrl = new URL(skinUrl);
      } catch (err: any) {
        throw ApiV1BadRequestError.missingOrInvalidQueryParameter('url', 'url needs to be a valid URL (e.g. start with https://)');
      }

      if (parsedSkinUrl.protocol !== 'https:') {
        throw ApiV1BadRequestError.missingOrInvalidQueryParameter('url', 'url needs to be an https URL');
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
            throw ApiV1BadRequestError.missingOrInvalidQueryParameter('url', 'url needs to point to a public IP address');
          }
          if (err instanceof SkinRequestFailedException) {
            throw new ApiV1BadRequestError(`Provided URL returned ${err.httpStatusCode} (${https.STATUS_CODES[err.httpStatusCode]})`);
          }
          throw err;
        }
      }

      const requestedRawSkin = this.parseBoolean((request.query as any).raw) ?? false;
      const renderSlim = this.parseBoolean((request.query as any).slim) ?? this.minecraftSkinTypeDetector.detect(skin.normalized) === 'alex';

      const skinResponse = await this.processSkinRequest(request, skin, renderSlim, requestedRawSkin, true);

      reply.header('Content-Type', 'image/png');
      if (skinResponse.forceDownload) {
        assert(skinResponse.skinArea != null);
        reply.header('Content-Disposition', `attachment; filename="x-url-${skinResponse.skinArea}.png"`);
        reply.header('Content-Type', 'application/octet-stream');
      }

      return reply
        // .header('Age', Math.floor(profile.ageInSeconds).toString())
        .header('Cache-Control', this.createCacheControlHeaderWithImmutable(60))
        .send(skinResponse.pngBody);
    });

    server.get('/skin/:user/:skinArea?', async (request, reply): Promise<RouteReturn> => {
      const profile = await this.resolveUserToProfile((request.params as any).user);

      if (profile == null) {
        reply.header('Cache-Control', 'max-age=60, s-maxage=60');
        throw ApiV1NotFoundError.profileForGivenUserNotFound();
      }
      const minecraftProfile = new MinecraftProfile(profile.profile);

      const requestedRawSkin = this.parseBoolean((request.query as any).raw) ?? false;
      const renderSlim = this.parseBoolean((request.query as any).slim) ?? minecraftProfile.parseTextures()?.slimPlayerModel ?? minecraftProfile.determineDefaultSkin() === 'alex';
      const skin = await this.minecraftSkinService.fetchEffectiveSkin(new MinecraftProfile(profile.profile));

      const skinResponse = await this.processSkinRequest(request, skin, renderSlim, requestedRawSkin);

      reply.header('Content-Type', 'image/png');
      if (skinResponse.forceDownload) {
        reply.header('Content-Disposition', `attachment; filename="${profile.profile.name}${skinResponse.skinArea != null ? `-${skinResponse.skinArea}` : ''}.png"`);
        reply.header('Content-Type', 'application/octet-stream');
      }

      return reply
        .header('Age', Math.floor(profile.ageInSeconds).toString())
        .header('Cache-Control', this.createCacheControlHeaderWithImmutable(60))
        .send(skinResponse.pngBody);
    });

    server.get('/skin/:user/:skinArea/3d', async (request, reply): Promise<RouteReturn> => {
      const profile = await this.resolveUserToProfile((request.params as any).user);
      if (profile == null) {
        reply.header('Cache-Control', 'max-age=60, s-maxage=60');
        throw ApiV1NotFoundError.profileForGivenUserNotFound();
      }
      const minecraftProfile = new MinecraftProfile(profile.profile);

      const requestedRawSkin = this.parseBoolean((request.query as any).raw) ?? false;
      const renderSlim = this.parseBoolean((request.query as any).slim) ?? minecraftProfile.parseTextures()?.slimPlayerModel ?? minecraftProfile.determineDefaultSkin() === 'alex';
      const skin = await this.minecraftSkinService.fetchEffectiveSkin(new MinecraftProfile(profile.profile));

      const skinResponse = await this.processSkinRequest(request, skin, renderSlim, requestedRawSkin, true);

      reply.header('Content-Type', 'image/png');
      if (skinResponse.forceDownload) {
        assert(skinResponse.skinArea != null);
        reply.header('Content-Disposition', `attachment; filename="${profile.profile.name}-${skinResponse.skinArea}.png"`);
        reply.header('Content-Type', 'application/octet-stream');
      }

      return reply
        .header('Age', Math.floor(profile.ageInSeconds).toString())
        .header('Cache-Control', this.createCacheControlHeaderWithImmutable(60))
        .send(skinResponse.pngBody);
    });

    server.get('/render/block', async (request, reply): Promise<RouteReturn> => {
      const size = this.parseSize((request.query as any).size) ?? 150;
      if (request.headers['content-type'] !== 'image/png') {
        throw ApiV1BadRequestError.missingOrInvalidBody('Content-Type', 'image/png');
      }

      let body = Buffer.alloc(0);
      for await (const chunk of request.raw) {
        body = Buffer.concat([body, chunk]);

        if (body.length > 3 * 1024 * 1024) {
          throw ApiV1BadRequestError.missingOrInvalidBody('body', 'body under 3 MiB');
        }
      }

      let blockTexture: ImageManipulator;
      try {
        const textureImage = await Sharp(body)
          .ensureAlpha()
          .resize(64, 64, { kernel: 'nearest', fit: 'outside' })
          .raw()
          .toBuffer({ resolveWithObject: true });
        blockTexture = new ImageManipulator(textureImage.data, textureImage.info);
      } catch (err: any) {
        throw ApiV1BadRequestError.missingOrInvalidBody('body', 'Valid PNG');
      }

      const renderedBlock = await this.legacyMinecraft3DRenderer.renderBlock(blockTexture);
      return reply
        .header('Cache-Control', 'no-store')
        .header('Content-Type', 'image/png')
        .send(await renderedBlock.toPngBuffer({ width: size, height: size }));
    });
  }

  private async resolveUserToProfile(inputUser: unknown): Promise<Profile | null> {
    if (typeof inputUser !== 'string' || inputUser.length <= 0) {
      throw ApiV1BadRequestError.missingOrInvalidUrlParameter('user', 'user.length > 0');
    }

    const inputUserLooksLikeUsername = inputUser.length <= 16;
    const inputUserLooksLikeUuid = UUID.looksLikeUuid(inputUser);
    if (!inputUserLooksLikeUsername && !inputUserLooksLikeUuid) {
      throw ApiV1BadRequestError.missingOrInvalidUrlParameter('user', 'Is valid uuid string or user.length <= 16');
    }

    if (inputUserLooksLikeUsername) {
      return await this.minecraftProfileService.provideProfileByUsername(inputUser);
    }
    return await this.minecraftProfileService.provideProfileByUuid(inputUser);
  }

  private async processSkinRequest(
    request: FastifyRequest,
    skin: Skin,
    renderSlim: boolean,
    requestedRawSkin: boolean,
    is3d: boolean = false,
  ): Promise<{ pngBody: Buffer; skinArea: 'head' | 'body' | null; forceDownload: boolean }> {
    function parseSkinArea(input: unknown): 'head' | 'body' | null {
      if (input == null) {
        return null;
      }

      if (input !== 'head' && input !== 'body') {
        throw ApiV1BadRequestError.missingOrInvalidUrlParameter('skinArea', 'Equal (ignore case) one of the following: "HEAD", "BODY"');
      }
      return input;
    }

    const userInputOverlay = (request.query as any).overlay;
    const userInputSlim = (request.query as any).slim;
    const userInputSize = (request.query as any).size;

    const requestedSkinArea = parseSkinArea((request.params as any).skinArea);
    if (userInputOverlay != null && requestedSkinArea == null) {
      throw new ApiV1BadRequestError('Cannot use "overlay" when just requesting the skin file (without "skinArea" or "3d")');
    }
    if (userInputSize != null && requestedSkinArea == null) {
      throw new ApiV1BadRequestError('Cannot use "size" when just requesting the skin file (without "skinArea" or "3d")');
    }
    if (userInputSlim != null && requestedSkinArea == null) {
      throw new ApiV1BadRequestError('Cannot use "slim" when just requesting the skin file (without "skinArea" or "3d")');
    }
    if (userInputSlim != null && requestedSkinArea === 'head') {
      throw new ApiV1BadRequestError('Cannot use "slim" when requesting the rendered head');
    }
    if (requestedRawSkin && requestedSkinArea != null) {
      throw new ApiV1BadRequestError('Cannot use "raw" when requesting a rendered skin (3d or skinArea)');
    }

    const renderOverlay = this.parseBoolean(userInputOverlay) ?? true;
    const renderSize = this.parseSize(userInputSize) ?? 512;
    const forceDownload = this.parseBoolean((request.query as any).download) ?? false;

    let responseSkin: ImageManipulator = requestedRawSkin ? skin.original : skin.normalized;
    let responseSkinIsRendered = false;

    if (is3d) {
      assert(requestedSkinArea != null);
      assert(responseSkin instanceof SkinImageManipulator);
      responseSkin = await this.renderSkin3d(responseSkin, requestedSkinArea, renderOverlay, renderSlim);
      responseSkinIsRendered = true;
    } else if (requestedSkinArea != null) {
      assert(responseSkin instanceof SkinImageManipulator);
      responseSkin = await this.renderSkin2d(responseSkin, requestedSkinArea, renderOverlay, renderSlim);
      responseSkinIsRendered = true;
    }

    const responseResizeOptions = responseSkinIsRendered ? { width: renderSize, height: renderSize } : undefined;
    const responseBody = await responseSkin.toPngBuffer(responseResizeOptions);

    return {
      pngBody: responseBody,
      skinArea: requestedSkinArea,
      forceDownload,
    };
  }

  private async renderSkin2d(skin: SkinImageManipulator, area: 'head' | 'body', overlay: boolean, slimModel: boolean): Promise<ImageManipulator> {
    if (area === 'head') {
      return this.skinImage2DRenderer.extractHead(skin, overlay);
    }
    return this.skinImage2DRenderer.extractBody(skin, overlay, slimModel);
  }

  private async renderSkin3d(skin: SkinImageManipulator, area: 'head' | 'body', overlay: boolean, slimModel: boolean): Promise<ImageManipulator> {
    if (area === 'head') {
      return this.legacyMinecraft3DRenderer.renderSkin(skin, area, overlay, slimModel);
    }
    return this.legacyMinecraft3DRenderer.renderSkin(skin, area, overlay, slimModel);
  }

  private parseBoolean(input: unknown): boolean | null {
    if (input == null) {
      return null;
    }

    if (input !== '1' && input !== '0' && input !== 'true' && input !== 'false') {
      throw new ApiV1BadRequestError(`Expected a "1", "0", "true" or "false" but got ${JSON.stringify(input)}`);
    }
    return input === '1' || input === 'true';
  }

  private parseSize(input: unknown): number | null {
    if (input == null) {
      return null;
    }

    if (typeof input !== 'string' || !/^\d+$/.test(input)) {
      throw ApiV1BadRequestError.missingOrInvalidQueryParameter('size', 'size >= 8 and size <= 1024');
    }

    const result = parseInt(input, 10);
    if (result < 8 || result > 1024) {
      throw ApiV1BadRequestError.missingOrInvalidQueryParameter('size', 'size >= 8 and size <= 1024');
    }
    return result;
  }

  private createCacheControlHeaderWithImmutable(cacheTimeInSeconds: number): string {
    return `max-age=${cacheTimeInSeconds}, s-maxage=${cacheTimeInSeconds}, immutable`;
  }
}

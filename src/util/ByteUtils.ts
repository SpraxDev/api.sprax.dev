export default class ByteUtils {
  /**
   * Prisma types `Bytes` fields as {@link Uint8Array} at runtime.
   *
   * This helper is meant to be used every time bytes are read from the database,
   * before calling any Buffer-specific methods (e.g. {@link Buffer#toString}, {@link Buffer#equals}, …) on them.
   * It can also be used when writing bytes to the database, as Prisma expects `Uint8Array<ArrayBuffer>`
   * while most Node.js APIs hand out `Buffer<ArrayBufferLike>`.
   *
   * The returned Buffer is a zero-copy view of the given bytes, if possible – Otherwise the bytes are copied instead.
   */
  static toBuffer(bytes: Uint8Array): Buffer<ArrayBuffer> {
    if (bytes.buffer instanceof ArrayBuffer) {
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }
    return Buffer.copyBytesFrom(bytes);
  }
}

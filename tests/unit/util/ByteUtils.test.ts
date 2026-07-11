import ByteUtils from '../../../src/util/ByteUtils.js';

describe('#toBuffer', () => {
  test('preserves the exact bytes of a plain Uint8Array (all 256 byte values)', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);

    const result = ByteUtils.toBuffer(bytes);

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(result)).toEqual(Array.from(bytes));
  });

  test('preserves the exact bytes of a Buffer', () => {
    const bytes = Buffer.from('89504e470d0a1a0a', 'hex');

    const result = ByteUtils.toBuffer(bytes);

    expect(result.toString('hex')).toBe('89504e470d0a1a0a');
  });

  test('only exposes the bytes of the given view, not the whole underlying ArrayBuffer', () => {
    const underlyingBytes = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const view = underlyingBytes.subarray(3, 7);

    const result = ByteUtils.toBuffer(view);

    expect(result.byteLength).toBe(4);
    expect(Array.from(result)).toEqual([3, 4, 5, 6]);
  });

  test('handles Buffers allocated from the internal Buffer pool (non-zero byteOffset)', () => {
    // small Buffer.from/allocUnsafe results share one pooled ArrayBuffer and usually have a non-zero byteOffset
    const bytes = Buffer.from('Sprax2013');

    const result = ByteUtils.toBuffer(bytes);

    expect(result.toString('utf-8')).toBe('Sprax2013');
    expect(result.byteLength).toBe(9);
  });

  test('is a zero-copy view for ArrayBuffer-backed bytes (mutations are visible in both directions)', () => {
    const bytes = Uint8Array.from([1, 2, 3]);

    const result = ByteUtils.toBuffer(bytes);
    bytes[0] = 42;
    result[2] = 100;

    expect(Array.from(result)).toEqual([42, 2, 100]);
    expect(Array.from(bytes)).toEqual([42, 2, 100]);
  });

  test('copies the bytes of a SharedArrayBuffer-backed Uint8Array', () => {
    const sharedArrayBuffer = new SharedArrayBuffer(4);
    const bytes = new Uint8Array(sharedArrayBuffer);
    bytes.set([255, 0, 128, 7]);

    const result = ByteUtils.toBuffer(bytes);

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(result)).toEqual([255, 0, 128, 7]);

    bytes[0] = 1; // the copy is expected to be detached from the shared memory
    expect(result[0]).toBe(255);
  });

  test('handles empty input', () => {
    expect(ByteUtils.toBuffer(new Uint8Array(0)).byteLength).toBe(0);
    expect(ByteUtils.toBuffer(new Uint8Array(new SharedArrayBuffer(0))).byteLength).toBe(0);
  });
});

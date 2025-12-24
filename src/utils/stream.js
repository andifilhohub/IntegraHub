import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';

export class ChecksumCalculator extends Transform {
  constructor() {
    super();
    this.hash = crypto.createHash('sha256');
  }

  _transform(chunk, encoding, callback) {
    this.hash.update(chunk);
    this.push(chunk);
    callback();
  }

  getChecksum() {
    return this.hash.digest('hex');
  }
}

export async function streamToStorage(inputStream, uploadFn) {
  const checksumCalc = new ChecksumCalculator();
  const chunks = [];
  let totalSize = 0;

  const collectChunks = new Transform({
    transform(chunk, encoding, callback) {
      chunks.push(chunk);
      totalSize += chunk.length;
      this.push(chunk);
      callback();
    }
  });

  await pipeline(
    inputStream,
    checksumCalc,
    collectChunks
  );

  const buffer = Buffer.concat(chunks);
  const checksum = checksumCalc.getChecksum();
  
  await uploadFn(buffer, totalSize);

  return { checksum, size: totalSize };
}

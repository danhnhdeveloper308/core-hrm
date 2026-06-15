export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType?: string;
}

/**
 * Interface cho mọi provider object storage — swap MinIO/AWS S3/R2 qua env,
 * code nghiệp vụ không biết gì về hạ tầng bên dưới (pattern như MailProvider).
 */
export interface StorageProvider {
  put(input: PutObjectInput): Promise<void>;
  /** URL ký tạm thời để client đọc trực tiếp. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

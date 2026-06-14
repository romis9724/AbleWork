import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Client as MinioClient } from 'minio'
import { Readable } from 'stream'

/**
 * MinIO(S3 호환) 오브젝트 스토리지 래퍼.
 * 전자결재 첨부파일·백업 zip 등 바이너리 산출물을 저장한다.
 * 환경변수: MINIO_ENDPOINT/PORT/USE_SSL/ROOT_USER/ROOT_PASSWORD/BUCKET
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name)
  private readonly client: MinioClient
  private readonly bucket: string
  /** 인프라(MinIO) 미구성 시 업로드 시도에서만 실패하도록 가용성 플래그를 둔다 */
  private available = false

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('MINIO_BUCKET', 'ablework')
    this.client = new MinioClient({
      endPoint: this.config.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: Number(this.config.get<string>('MINIO_PORT', '9000')),
      useSSL: this.config.get<string>('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.config.get<string>('MINIO_ROOT_USER', 'minioadmin'),
      secretKey: this.config.get<string>('MINIO_ROOT_PASSWORD', 'minioadmin'),
    })
  }

  async onModuleInit(): Promise<void> {
    // 버킷 자동 생성 — 스토리지 미가용 시 부팅을 막지 않고 로깅만 한다(첨부 기능만 비활성).
    try {
      const exists = await this.client.bucketExists(this.bucket)
      if (!exists) {
        await this.client.makeBucket(this.bucket, '')
        this.logger.log(`Created storage bucket: ${this.bucket}`)
      }
      this.available = true
    } catch (error) {
      this.logger.warn(
        `Storage(MinIO) unavailable at startup — attachment features disabled until reachable. ${
          (error as Error).message
        }`,
      )
    }
  }

  isAvailable(): boolean {
    return this.available
  }

  /** 버퍼 업로드 — storageKey(오브젝트 키) 반환 */
  async putObject(
    storageKey: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.putObject(this.bucket, storageKey, buffer, buffer.length, {
      'Content-Type': contentType,
    })
  }

  /** 오브젝트 스트림 다운로드 */
  async getObjectStream(storageKey: string): Promise<Readable> {
    return this.client.getObject(this.bucket, storageKey)
  }

  /** 오브젝트 삭제 (멱등 — 없는 키여도 예외 던지지 않음) */
  async removeObject(storageKey: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucket, storageKey)
    } catch (error) {
      this.logger.warn(`Failed to remove object ${storageKey}: ${(error as Error).message}`)
    }
  }

  /** 다운로드용 presigned URL (만료 초, 기본 1시간) — 백업 zip 등에 사용 */
  async presignedGetUrl(storageKey: string, expirySeconds = 3600): Promise<string> {
    return this.client.presignedGetObject(this.bucket, storageKey, expirySeconds)
  }
}

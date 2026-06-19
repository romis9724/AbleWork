import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Readable } from 'stream'

/**
 * S3(또는 S3 호환) 오브젝트 스토리지 래퍼.
 * 전자결재 첨부파일·백업 zip 등 바이너리 산출물을 저장한다.
 *
 * 운영(AWS): EC2 인스턴스 역할의 기본 자격증명 체인을 사용한다(정적 키 없음).
 *   환경변수: AWS_REGION, S3_BUCKET
 * 로컬 개발(MinIO 등): S3_ENDPOINT 가 있으면 path-style + 정적 자격증명을 사용한다.
 *   환경변수: S3_ENDPOINT, S3_ACCESS_KEY(또는 AWS_ACCESS_KEY_ID), S3_SECRET_KEY(또는 AWS_SECRET_ACCESS_KEY)
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name)
  private readonly client: S3Client
  private readonly bucket: string
  /** 인프라(S3) 미구성 시 업로드 시도에서만 실패하도록 가용성 플래그를 둔다 */
  private available = false

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('S3_BUCKET', 'ablework')
    const region = this.config.get<string>('AWS_REGION', 'ap-northeast-2')
    const endpoint = this.config.get<string>('S3_ENDPOINT')

    if (endpoint) {
      // 로컬 개발(MinIO 등): 커스텀 엔드포인트 + path-style + 정적 자격증명
      this.client = new S3Client({
        region,
        endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId:
            this.config.get<string>('S3_ACCESS_KEY') ??
            this.config.get<string>('AWS_ACCESS_KEY_ID', 'minioadmin'),
          secretAccessKey:
            this.config.get<string>('S3_SECRET_KEY') ??
            this.config.get<string>('AWS_SECRET_ACCESS_KEY', 'minioadmin'),
        },
      })
    } else {
      // 운영(EC2 인스턴스 역할): 기본 자격증명 체인
      this.client = new S3Client({ region })
    }
  }

  async onModuleInit(): Promise<void> {
    // 버킷 가용성 확인 — 미가용 시 부팅을 막지 않고 로깅만 한다(첨부 기능만 비활성).
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
      this.available = true
    } catch {
      // 버킷이 없으면 생성 시도(주로 로컬 MinIO 편의). 운영 S3 버킷은 CLI로 선생성된다.
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }))
        this.logger.log(`Created storage bucket: ${this.bucket}`)
        this.available = true
      } catch (error) {
        this.logger.warn(
          `Storage(S3) unavailable at startup — attachment features disabled until reachable. ${
            (error as Error).message
          }`,
        )
      }
    }
  }

  isAvailable(): boolean {
    return this.available
  }

  /** 버퍼 업로드 — storageKey(오브젝트 키)로 저장 */
  async putObject(storageKey: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: contentType,
      }),
    )
  }

  /** 오브젝트 스트림 다운로드 */
  async getObjectStream(storageKey: string): Promise<Readable> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    )
    // Node 런타임에서 Body 는 Readable 스트림이다.
    return res.Body as unknown as Readable
  }

  /** 오브젝트 삭제 (멱등 — 없는 키여도 예외 던지지 않음) */
  async removeObject(storageKey: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }))
    } catch (error) {
      this.logger.warn(`Failed to remove object ${storageKey}: ${(error as Error).message}`)
    }
  }

  /** 다운로드용 presigned URL (만료 초, 기본 1시간) — 백업 zip 등에 사용 */
  async presignedGetUrl(storageKey: string, expirySeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      { expiresIn: expirySeconds },
    )
  }
}

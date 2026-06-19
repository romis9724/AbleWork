#!/usr/bin/env bash
# Step 5: 엣지(멱등) — ACM(us-east-1)·CloudFront·Route53(work.abmwc.net).
#   CloudFront(단일 도메인) → ALB(HTTP). ALB SG는 03에서 CloudFront prefix-list로 제한됨.
# 사용: bash deploy/aws/06-edge.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
ensure_aws
[ -n "${ALB_DNS:-}" ] || die "ALB_DNS 없음 — 05-compute.sh 먼저."
TMP="$(mktemp -d)"; trap 'rm -rf "${TMP}"' EXIT

PARENT_DOMAIN="abmwc.net"
ZONE_ID="$(aws route53 list-hosted-zones-by-name --dns-name "${PARENT_DOMAIN}" \
  --query "HostedZones[?Name=='${PARENT_DOMAIN}.'].Id | [0]" --output text | sed 's#/hostedzone/##')"
[ -n "${ZONE_ID}" ] && [ "${ZONE_ID}" != "None" ] || die "${PARENT_DOMAIN} Route53 호스팅존을 찾지 못했습니다."
ok "Route53 호스팅존: ${ZONE_ID}"

r53_upsert() {  # name type value [alias_target_zone]
  local name="$1" rtype="$2" value="$3" az="${4:-}" batch
  if [ -n "${az}" ]; then
    batch="{\"Changes\":[{\"Action\":\"UPSERT\",\"ResourceRecordSet\":{\"Name\":\"${name}\",\"Type\":\"${rtype}\",\"AliasTarget\":{\"HostedZoneId\":\"${az}\",\"DNSName\":\"${value}\",\"EvaluateTargetHealth\":false}}}]}"
  else
    batch="{\"Changes\":[{\"Action\":\"UPSERT\",\"ResourceRecordSet\":{\"Name\":\"${name}\",\"Type\":\"${rtype}\",\"TTL\":300,\"ResourceRecords\":[{\"Value\":\"${value}\"}]}}]}"
  fi
  aws route53 change-resource-record-sets --hosted-zone-id "${ZONE_ID}" --change-batch "${batch}" --query 'ChangeInfo.Id' --output text
}

# ---- ACM (us-east-1, CloudFront 전용) ----
CERT_ARN="$(none_to_empty "$(aws acm list-certificates --region us-east-1 \
  --query "CertificateSummaryList[?DomainName=='${DOMAIN}'].CertificateArn | [0]" --output text 2>/dev/null || true)")"
if [ -z "${CERT_ARN}" ]; then
  CERT_ARN="$(aws acm request-certificate --region us-east-1 --domain-name "${DOMAIN}" \
    --validation-method DNS --query CertificateArn --output text)"
  ok "ACM 인증서 요청: ${CERT_ARN}"
else ok "ACM 인증서 존재: ${CERT_ARN}"; fi
state_set CERT_ARN "${CERT_ARN}"

# 검증 레코드(생성까지 약간 지연) 폴링 → Route53 CNAME upsert
RR_NAME=""
for _ in $(seq 1 24); do
  RR_NAME="$(none_to_empty "$(aws acm describe-certificate --region us-east-1 --certificate-arn "${CERT_ARN}" \
    --query 'Certificate.DomainValidationOptions[0].ResourceRecord.Name' --output text 2>/dev/null || true)")"
  [ -n "${RR_NAME}" ] && break; sleep 5
done
[ -n "${RR_NAME}" ] || die "ACM 검증 레코드 조회 실패"
CERT_STATUS="$(aws acm describe-certificate --region us-east-1 --certificate-arn "${CERT_ARN}" --query 'Certificate.Status' --output text)"
if [ "${CERT_STATUS}" != "ISSUED" ]; then
  RR_VALUE="$(aws acm describe-certificate --region us-east-1 --certificate-arn "${CERT_ARN}" \
    --query 'Certificate.DomainValidationOptions[0].ResourceRecord.Value' --output text)"
  r53_upsert "${RR_NAME}" CNAME "${RR_VALUE}" >/dev/null
  ok "ACM 검증 CNAME 추가: ${RR_NAME}"
  log "ACM 검증 대기..."
  aws acm wait certificate-validated --region us-east-1 --certificate-arn "${CERT_ARN}"
fi
ok "ACM 인증서 ISSUED"

# ---- CloudFront 배포 (alias 기준 멱등) ----
DIST_ID="$(none_to_empty "$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?contains(Aliases.Items, '${DOMAIN}')].Id | [0]" --output text 2>/dev/null || true)")"
if [ -z "${DIST_ID}" ]; then
  cat > "${TMP}/dist.json" <<JSON
{
  "CallerReference": "${NAME}-$(date +%s)",
  "Aliases": { "Quantity": 1, "Items": ["${DOMAIN}"] },
  "Origins": { "Quantity": 1, "Items": [{
    "Id": "alb",
    "DomainName": "${ALB_DNS}",
    "CustomOriginConfig": {
      "HTTPPort": 80, "HTTPSPort": 443, "OriginProtocolPolicy": "http-only",
      "OriginSslProtocols": { "Quantity": 1, "Items": ["TLSv1.2"] },
      "OriginReadTimeout": 30, "OriginKeepaliveTimeout": 5
    }
  }]},
  "DefaultCacheBehavior": {
    "TargetOriginId": "alb",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": { "Quantity": 7, "Items": ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] } },
    "Compress": true,
    "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
    "OriginRequestPolicyId": "216adef6-5c7f-47e4-b989-5492eafa07d3"
  },
  "CacheBehaviors": { "Quantity": 1, "Items": [{
    "PathPattern": "/_next/static/*",
    "TargetOriginId": "alb",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": { "Quantity": 2, "Items": ["GET","HEAD"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] } },
    "Compress": true,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }]},
  "Comment": "AbleWork ${ENVIRONMENT}",
  "Enabled": true,
  "HttpVersion": "http2and3",
  "PriceClass": "PriceClass_200",
  "ViewerCertificate": {
    "ACMCertificateArn": "${CERT_ARN}",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  }
}
JSON
  DIST_ID="$(aws cloudfront create-distribution --distribution-config "file://${TMP}/dist.json" --query 'Distribution.Id' --output text)"
  ok "CloudFront 배포 생성: ${DIST_ID}"
else ok "CloudFront 배포 존재: ${DIST_ID}"; fi
state_set CF_DIST_ID "${DIST_ID}"
CF_DOMAIN="$(aws cloudfront get-distribution --id "${DIST_ID}" --query 'Distribution.DomainName' --output text)"
state_set CF_DOMAIN "${CF_DOMAIN}"

# ---- Route53 ALIAS: work.abmwc.net → CloudFront (CF alias zone = Z2FDTNDATAQYW2) ----
r53_upsert "${DOMAIN}." A "${CF_DOMAIN}" "Z2FDTNDATAQYW2" >/dev/null
ok "Route53 ALIAS: ${DOMAIN} → ${CF_DOMAIN}"

echo "----------------------------------------------------------------"
log "CloudFront: ${DIST_ID} (${CF_DOMAIN})"
log "도메인: https://${DOMAIN}"
echo "----------------------------------------------------------------"
warn "CloudFront 전파 ~15분. 대기: aws cloudfront wait distribution-deployed --id ${DIST_ID}"
ok "06-edge 완료"

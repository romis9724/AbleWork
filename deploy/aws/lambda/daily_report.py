"""매일 정해진 시각(EventBridge)에 AWS 인프라 현황을 수집해 Discord 웹훅으로 발송.
환경변수: REGION, INSTANCE_ID, DB_ID, REDIS_ID, TG_ARNS(콤마구분), DISCORD_REPORT_WEBHOOK_URL
"""
import datetime
import json
import os
import urllib.request

import boto3

REGION = os.environ.get("REGION", "ap-northeast-2")
INSTANCE_ID = os.environ["INSTANCE_ID"]
DB_ID = os.environ["DB_ID"]
REDIS_ID = os.environ["REDIS_ID"]
TG_ARNS = [a for a in os.environ.get("TG_ARNS", "").split(",") if a]
WEBHOOK = os.environ["DISCORD_REPORT_WEBHOOK_URL"]
KST = datetime.timezone(datetime.timedelta(hours=9))


def handler(event, context):
    ec2 = boto3.client("ec2", region_name=REGION)
    rds = boto3.client("rds", region_name=REGION)
    ec = boto3.client("elasticache", region_name=REGION)
    elb = boto3.client("elbv2", region_name=REGION)
    cw = boto3.client("cloudwatch", region_name=REGION)

    now = datetime.datetime.now(KST)
    L = []
    color = 0x3498DB  # 정상=파랑

    try:
        s = ec2.describe_instances(InstanceIds=[INSTANCE_ID])
        st = s["Reservations"][0]["Instances"][0]["State"]["Name"]
        L.append(f"■ EC2 `{INSTANCE_ID}`: {st}")
    except Exception as e:  # noqa: BLE001
        L.append(f"■ EC2: 조회 실패 ({e})")

    try:
        d = rds.describe_db_instances(DBInstanceIdentifier=DB_ID)["DBInstances"][0]
        L.append(
            f"■ RDS `{DB_ID}`: {d['DBInstanceStatus']} "
            f"({d['DBInstanceClass']}, {d['AllocatedStorage']}GB)"
        )
    except Exception as e:  # noqa: BLE001
        L.append(f"■ RDS: 조회 실패 ({e})")

    try:
        c = ec.describe_cache_clusters(CacheClusterId=REDIS_ID)["CacheClusters"][0]
        L.append(f"■ Redis `{REDIS_ID}`: {c['CacheClusterStatus']} ({c['CacheNodeType']})")
    except Exception as e:  # noqa: BLE001
        L.append(f"■ Redis: 조회 실패 ({e})")

    for arn in TG_ARNS:
        try:
            hs = elb.describe_target_health(TargetGroupArn=arn)["TargetHealthDescriptions"]
            states = ", ".join(t["TargetHealth"]["State"] for t in hs) or "no targets"
            L.append(f"■ TG `{arn.split('/')[1]}`: {states}")
        except Exception as e:  # noqa: BLE001
            L.append(f"■ TG: 조회 실패 ({e})")

    try:
        al = cw.describe_alarms(StateValue="ALARM", AlarmNamePrefix="ablework-prod")["MetricAlarms"]
        if al:
            color = 0xE74C3C  # ALARM 있으면 빨강
            L.append("")
            L.append(f"⚠ **ALARM {len(al)}건**: " + ", ".join(a["AlarmName"] for a in al))
        else:
            L.append("")
            L.append("✓ ALARM 상태 경보 없음")
    except Exception as e:  # noqa: BLE001
        L.append(f"알람 조회 실패 ({e})")

    try:
        ce = boto3.client("ce", region_name="us-east-1")
        utc = datetime.datetime.utcnow()
        start = utc.replace(day=1).strftime("%Y-%m-%d")
        end = utc.strftime("%Y-%m-%d")
        if start == end:
            end = (utc + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
        r = ce.get_cost_and_usage(
            TimePeriod={"Start": start, "End": end},
            Granularity="MONTHLY",
            Metrics=["UnblendedCost"],
        )
        amt = float(r["ResultsByTime"][0]["Total"]["UnblendedCost"]["Amount"])
        L.append(f"■ 이번 달 누적 비용(MTD): **${amt:.2f}**")
    except Exception as e:  # noqa: BLE001
        L.append(f"비용 조회 실패 ({e})")

    embed = {
        "title": f"AbleWork 인프라 일일보고 — {now:%Y-%m-%d}",
        "description": "\n".join(L)[:4000],
        "color": color,
        "footer": {"text": f"{now:%Y-%m-%d %H:%M} KST · work.abmwc.net"},
    }
    body = json.dumps({"username": "AbleWork Report", "embeds": [embed]}).encode("utf-8")
    req = urllib.request.Request(
        WEBHOOK,
        data=body,
        headers={
            "Content-Type": "application/json",
            # Discord(Cloudflare)는 기본 python-urllib UA를 403으로 차단 → 명시적 UA 필요
            "User-Agent": "AbleWork-Ops/1.0 (+https://work.abmwc.net)",
        },
    )
    urllib.request.urlopen(req, timeout=10)
    return {"ok": True}

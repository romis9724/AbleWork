"""SNS → Discord 웹훅 중계.
CloudWatch 알람(JSON)·AWS Budgets(텍스트)·기타 SNS 메시지를 Discord 임베드로 전송한다.
환경변수: DISCORD_WEBHOOK_URL
"""
import json
import os
import urllib.request

WEBHOOK = os.environ["DISCORD_WEBHOOK_URL"]

COLORS = {"ALARM": 0xE74C3C, "OK": 0x2ECC71, "INSUFFICIENT_DATA": 0xF1C40F}


def _post(embed):
    body = json.dumps({"username": "AbleWork Ops", "embeds": [embed]}).encode("utf-8")
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


def handler(event, context):
    for rec in event.get("Records", []):
        sns = rec.get("Sns", {})
        subject = sns.get("Subject") or "AWS 알림"
        raw = sns.get("Message", "")
        title, desc, color, fields = subject, raw, 0x95A5A6, []
        try:
            m = json.loads(raw)
            if isinstance(m, dict) and "AlarmName" in m:  # CloudWatch 알람
                state = m.get("NewStateValue", "")
                color = COLORS.get(state, 0x95A5A6)
                title = f"[{state}] {m.get('AlarmName', '')}"
                desc = (m.get("NewStateReason") or "")[:1500]
                fields = [
                    {"name": "상태", "value": state or "-", "inline": True},
                    {"name": "리전", "value": m.get("Region", "-"), "inline": True},
                ]
        except (ValueError, TypeError):
            desc = raw[:1500]
        embed = {
            "title": title[:256],
            "description": desc or "-",
            "color": color,
            "fields": fields,
        }
        _post(embed)
    return {"ok": True}

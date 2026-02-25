# GuardDuty / Health 通知設定 チェックガイド

## 概要

GuardDuty Finding および Health イベントが漏れなく Slack に通知されるかを確認するためのチェックリスト。
Security Hub クロスリージョン集約を前提とした構成を対象とする。

## 想定アーキテクチャ

```
各リージョンの GuardDuty Finding / Health Event
  → 各リージョンの Security Hub CSPM（Finding 受信）
    → 集約リージョンの Security Hub（クロスリージョン集約）
      → EventBridge ルール
        → SNS トピック
          → AWS Chatbot → Slack
```

---

## チェックポイント一覧

### 1. GuardDuty Detector

各対象リージョンで GuardDuty が有効であること。

```bash
# 対象リージョンごとに実行
aws guardduty list-detectors --region <REGION> --output text
```

- **OK**: `DETECTORIDS` に ID が表示される
- **NG**: 空 → GuardDuty が有効化されていない

---

### 2. Security Hub CSPM

各対象リージョンで Security Hub CSPM が有効であること。
**集約元リージョンでも有効化が必須**（集約リージョンだけでは不十分）。

```bash
# 対象リージョンごとに実行
aws securityhub describe-hub --region <REGION> --output json
```

- **OK**: `HubArn` と `SubscribedAt` が返る
- **NG**: `not subscribed` エラー → Security Hub CSPM が有効化されていない

---

### 3. Security Hub プロダクト統合

各対象リージョンで GuardDuty / Health が Security Hub に統合されていること。

```bash
aws securityhub list-enabled-products-for-import --region <REGION> \
  --query "ProductSubscriptions[?contains(@,'guardduty') || contains(@,'health')]" \
  --output json
```

- **OK**: `aws/guardduty` と `aws/health` が含まれている
- **NG**: 含まれていない → 該当サービスの Finding が Security Hub に取り込まれない

---

### 4. クロスリージョン集約

集約リージョンに Finding Aggregator が設定され、対象リージョンが含まれていること。

```bash
# 集約リージョンで実行
aws securityhub list-finding-aggregators --region <AGGREGATION_REGION> --output json
```

```bash
# 詳細確認
aws securityhub get-finding-aggregator \
  --finding-aggregator-arn <AGGREGATOR_ARN> \
  --region <AGGREGATION_REGION> \
  --output json
```

確認項目:
- **集約リージョン** (`FindingAggregationRegion`) が正しいか
- **リンクモード** (`RegionLinkingMode`) が `ALL_REGIONS` または `SPECIFIED_REGIONS`
- **対象リージョン** (`Regions`) に全対象リージョンが含まれているか

---

### 5. EventBridge ルール

集約リージョンに GuardDuty / Health 用の EventBridge ルールが存在し、ENABLED であること。

```bash
# 集約リージョンで実行
aws events list-rules --region <AGGREGATION_REGION> \
  --query 'Rules[].{Name:Name,State:State,EventPattern:EventPattern}' \
  --output json
```

確認項目:

#### GuardDuty ルール
- `source: aws.securityhub` + `detail-type: Security Hub Findings - Imported` + `ProductName: GuardDuty`
- State が `ENABLED`

#### Health ルール
- `source: aws.securityhub` + `detail-type: Security Hub Findings - Imported` + `ProductName: Health`
- State が `ENABLED`
- 除外フィルタ（例: `AWS_ACM_RENEWAL_STATE_CHANGE`）が意図通りか

---

### 6. EventBridge ターゲット（SNS）

各ルールのターゲットが SNS トピックに設定されていること。

```bash
aws events list-targets-by-rule --rule <RULE_NAME> --region <AGGREGATION_REGION> --output json
```

- **OK**: `Arn` が `arn:aws:sns:...` の SNS トピックを指している
- **NG**: ターゲットが空、または意図しない宛先

---

### 7. SNS サブスクリプション

ターゲットの SNS トピックに Chatbot 向けのサブスクリプションがあること。

```bash
aws sns list-subscriptions-by-topic \
  --topic-arn <SNS_TOPIC_ARN> \
  --region <REGION> \
  --output json
```

- **OK**: `Protocol: https`, `Endpoint: https://global.sns-api.chatbot.amazonaws.com` が存在
- **NG**: サブスクリプションが空 → 通知先がない

---

### 8. AWS Chatbot → Slack

Chatbot が正しい Slack チャンネルに紐づいていること。

```bash
# Chatbot API はリージョン固有（us-east-2 等で確認可能）
aws chatbot describe-slack-channel-configurations --region us-east-2 --output json
```

確認項目:
- `SnsTopicArns` にチェック 7 の SNS トピック ARN が含まれているか
- `SlackChannelName` が意図した通知先チャンネルか
- `State` が `ENABLED` か

---

## Security Hub メンバーアカウント確認

### 9. 統合対象アカウント一覧

Security Hub に統合されているメンバーアカウントを確認する。
管理者アカウントから実行すること。

```bash
# メンバーアカウント一覧（Security Hub 管理者アカウントで実行）
aws securityhub list-members --region <AGGREGATION_REGION> \
  --query 'Members[].{AccountId:AccountId,MemberStatus:MemberStatus}' \
  --output table
```

- **OK**: 対象アカウントが全て含まれ、`MemberStatus` が `Enabled`
- **NG**: 対象アカウントが含まれていない → そのアカウントの Finding は集約されない

アカウント名を確認する場合（Organizations 管理アカウントで実行）:

```bash
aws organizations list-accounts \
  --query 'Accounts[].{Id:Id,Name:Name,Status:Status}' \
  --output table
```

---

## 2重通知チェック

### AWS User Notifications

User Notifications が同じイベントを別経路で通知していないか確認する。

```bash
aws notifications list-notification-configurations --region us-east-1 --output json
```

設定がある場合:

```bash
# イベントルール確認
aws notifications list-event-rules \
  --notification-configuration-arn <CONFIG_ARN> \
  --region us-east-1 --output json

# 通知チャンネル確認
aws notifications list-channels \
  --notification-configuration-arn <CONFIG_ARN> \
  --region us-east-1 --output json
```

- User Notifications が Security Hub 経由と同じイベント（`aws.health` 等）を対象にしている場合、**2重通知になる**
- 不要であれば `aws notifications delete-notification-configuration` で削除

---

## チェック結果テンプレート

| # | チェック項目 | リージョン A | リージョン B | 状態 |
|---|---|---|---|---|
| 1 | GuardDuty Detector | | | |
| 2 | Security Hub CSPM | | | |
| 3a | GuardDuty → Hub 統合 | | | |
| 3b | Health → Hub 統合 | | | |
| 4 | クロスリージョン集約 | 集約リージョン: ______ / リンク対象に含む: | | |
| 5a | EventBridge: GuardDuty ルール (集約リージョン) | ENABLED / ルール名: | - | |
| 5b | EventBridge: Health ルール (集約リージョン) | ENABLED / ルール名: | - | |
| 6a | EventBridge → SNS ターゲット (GuardDuty) | トピック: | - | |
| 6b | EventBridge → SNS ターゲット (Health) | トピック: | - | |
| 7 | SNS → Chatbot サブスクリプション | | - | |
| 8 | Chatbot → Slack チャンネル | チャンネル: | - | |
| 9 | Security Hub メンバーアカウント | 対象アカウント数: / 全て Enabled: | - | |
| - | 2重通知 (User Notifications) | なし / あり → 対応: | | |

---

## 注意事項

- **Security Hub CSPM は各リージョンで有効化が必要。** 集約リージョンだけでは、他リージョンの Finding は取り込まれない。
- **AWS User Notifications の Managed Notification は Health のみ対応。** GuardDuty は User Notifications ではサポートされていない。
- **AWS Config は GuardDuty/Health の通知には不要。** Security Hub CSPM のコンプライアンスチェック（CIS 等）を使う場合のみ必要。
- **EventBridge ルールは集約リージョンにのみ必要。** クロスリージョン集約により、他リージョンの Finding も集約リージョンの EventBridge に流れる。

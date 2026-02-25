# AWS Monitoring Dashboard

GuardDuty Findings / Health Dashboard Events をウェブ UI でモニタリングするアプリケーション。

## アーキテクチャ

- **ECS Express Mode** (Fargate, HTTPS 自動, オートスケーリング 1〜3台)
- **DynamoDB** (オンデマンド) - Findings / Health Events 保存
- **ECR** - コンテナイメージ管理
- **EventBridge + Lambda** - リアルタイムイベント取り込み (マルチリージョン)

## 構成図

```
                          +------------------------+
                          |   Browser (Dashboard)  |
                          +-----------+------------+
                                      | HTTPS
                                      v
               +------------------------------------------+
               | ECS Express Gateway Service              |
               | (aws-monitoring-svc)                     |
               |                                          |
               |  Express.js (Node.js 22)                 |
               |  +- Dashboard UI  (HTML/JS/CSS)          |
               |  +- REST API      (GET/PATCH)            |
               |  +- Cron Sync     (GuardDuty/Health)     |
               +-----+----------------+-------+-----------+
                     |                |       |
        GuardDuty API|  SecurityHub   |       | DynamoDB
                     |  (Health) API  |       | CRUD
                     v                v       v
          +----------+--+   +---------+--+  +-----------+
          | GuardDuty   |   | Security   |  | DynamoDB  |
          | (multi-     |   | Hub        |  | Tables    |
          |  region)    |   | (Health)   |  |           |
          +-------------+   +------------+  +-----+-----+
                                                  ^
                                                  |
                                           +------+------+
                                           |   Lambda    |
                                           |   (event-   |
                                           |   processor)|
                                           +------+------+
                                                  ^
               +----------------------------------+
               |              EventBridge
  +------------+--------+  +-----------+--------+  +----------+---------+
  | ap-northeast-1      |  | us-west-2          |  | us-east-1          |
  | EventBridge Rule    |  | EventBridge Rule   |  | EventBridge Rule   |
  | (GuardDuty fwd)     |  | (Health fwd)       |  | (GD + Health)      |
  | -----> us-east-1    |  | -----> us-east-1   |  | -----> Lambda      |
  +---------------------+  +--------------------+  +--------------------+
```

### データフロー

| パス | 説明 |
|---|---|
| **Sync (ECS Cron)** | 定期的に GuardDuty API / Security Hub API を呼び出し DynamoDB に PutItem |
| **EventBridge + Lambda** | リアルタイムイベントを各リージョンから us-east-1 に転送し Lambda で DynamoDB に PutItem |
| **Dashboard** | ブラウザから REST API 経由で DynamoDB を Query/Scan して表示 |
| **Determination/Comment** | ユーザーがモーダルから保存 → PATCH API → DynamoDB UpdateItem |

## AWS リソース一覧

### Compute

| リソース | 名前 | 説明 |
|---|---|---|
| ECS Cluster | `aws-monitoring-cluster` | Fargate クラスター (Container Insights 有効) |
| ECS Express Gateway Service | `aws-monitoring-svc` | Express.js アプリ (CPU 256 / Mem 512, 1-3 タスク, CPU 80% オートスケール) |
| ECR Repository | `aws-monitoring` | Docker イメージリポジトリ (scan on push 有効) |
| Lambda Function | `aws-monitoring-event-processor` | EventBridge イベント処理 (Node.js 22, 128MB, 30s timeout) |

### Database

| リソース | 名前 | 説明 |
|---|---|---|
| DynamoDB Table | `aws-monitoring-guardduty-findings` | GuardDuty Findings (pk/sk, TTL 1年, PITR 有効) |
| DynamoDB GSI | `gsi-type-severity` | type + severity で検索 |
| DynamoDB Table | `aws-monitoring-health-events` | Health Events (pk/sk, TTL 1年, PITR 有効) |
| DynamoDB GSI | `gsi-status` | statusCode + startTime で検索 |

### EventBridge

| リソース | リージョン | 説明 |
|---|---|---|
| EventBridge Rule | us-east-1 | `aws.guardduty` + `aws.health` → Lambda |
| EventBridge Rule | ap-northeast-1 | GuardDuty イベントを us-east-1 に転送 |
| EventBridge Rule | us-west-2 | Health イベントを us-east-1 に転送 |

### IAM

| リソース | 名前 | 用途 |
|---|---|---|
| IAM Role | `aws-monitoring-ecs-execution` | ECS タスク実行ロール (イメージ pull, ログ書き込み) |
| IAM Role | `aws-monitoring-ecs-task` | ECS タスクロール (GuardDuty, SecurityHub, Organizations, DynamoDB) |
| IAM Role | `aws-monitoring-ecs-infrastructure` | ECS Express Mode インフラロール |
| IAM Role | `aws-monitoring-event-processor` | Lambda 実行ロール (DynamoDB PutItem/GetItem, CloudWatch Logs) |
| IAM Role | `aws-monitoring-eventbridge-forwarder` | EventBridge クロスリージョン転送ロール |

### Logging

| リソース | 名前 | 保持期間 |
|---|---|---|
| CloudWatch Log Group | `/ecs/aws-monitoring` | 30日 |
| CloudWatch Log Group | `/aws/lambda/aws-monitoring-event-processor` | 30日 |

### Network

| リソース | 説明 |
|---|---|
| VPC | 既存 VPC を参照 (`<VPC_ID>`) |
| Subnets | 既存サブネット 3つ (マルチ AZ) |

## DynamoDB スキーマ

### GuardDuty Findings テーブル

| 属性 | 型 | 説明 |
|---|---|---|
| `pk` (PK) | S | AWS アカウント ID |
| `sk` (SK) | S | `FINDING#<findingId>` |
| `findingId` | S | GuardDuty Finding ID |
| `type` | S | Finding タイプ |
| `severity` | N | 重要度 (0-10) |
| `title` | S | タイトル |
| `description` | S | 説明 |
| `region` | S | リージョン |
| `archived` | BOOL | アーカイブ済みフラグ |
| `determination` | S | 運用判定 (未対応 / 調査中 / 問題有り / 問題無し) |
| `comment` | S | ユーザーコメント |
| `ttl` | N | TTL (書き込みから 1 年) |

### Health Events テーブル

| 属性 | 型 | 説明 |
|---|---|---|
| `pk` (PK) | S | AWS アカウント ID |
| `sk` (SK) | S | `EVENT#<eventArn>` |
| `findingId` | S | Health Event ARN |
| `service` | S | AWS サービス名 |
| `eventTypeCode` | S | イベントタイプコード |
| `statusCode` | S | open / closed |
| `severity` | S | CRITICAL / HIGH / MEDIUM / LOW / INFORMATIONAL |
| `determination` | S | 運用判定 (未対応 / 調査中 / 問題有り / 問題無し) |
| `comment` | S | ユーザーコメント |
| `ttl` | N | TTL (書き込みから 1 年) |

## API エンドポイント

| Method | Path | 説明 |
|---|---|---|
| GET | `/api/guardduty/findings` | GuardDuty Findings 一覧 |
| GET | `/api/guardduty/findings/:accountId/:findingId` | Finding 詳細 |
| PATCH | `/api/guardduty/findings/:accountId/:findingId` | Determination / Comment 更新 |
| POST | `/api/guardduty/sync` | GuardDuty 手動同期 |
| GET | `/api/health/events` | Health Events 一覧 |
| GET | `/api/health/events/:accountId/:findingId` | Event 詳細 |
| PATCH | `/api/health/events/:accountId/:findingId` | Determination / Comment 更新 |
| POST | `/api/health/sync` | Health 手動同期 |
| GET | `/api/dashboard/summary` | ダッシュボード集計 |
| GET | `/api/accounts` | アカウント名マッピング |

### PATCH リクエストボディ

```json
{
  "determination": "調査中",
  "comment": "対応中です"
}
```

`determination` の有効値: `""` (未選択) / `"未対応"` / `"調査中"` / `"問題有り"` / `"問題無し"`

## URL

```
https://<endpoint>.ecs.us-east-1.on.aws
```

エンドポイントは `terraform output service_url` で確認できます。

## 前提条件

- AWS CLI v2
- Docker
- Terraform >= 1.5
- AWS 認証情報 (ECR push / ECS 操作権限)

## デプロイ

アプリケーションコードを変更した後のデプロイ手順です。
Terraform の操作は不要です。

### GitHub Actions (推奨)

GitHub リポジトリの **Actions** タブから `Deploy` ワークフローを手動実行します。

| 入力 | 説明 | デフォルト |
|---|---|---|
| `deploy_app` | ECS アプリをデプロイ | `true` |
| `deploy_lambda` | Lambda をデプロイ | `false` |

#### 初回セットアップ (OIDC + GitHub Secret)

```bash
# 1. terraform.tfvars に GitHub 情報を追加
cd src/infra/environments/prod
cat >> terraform.tfvars <<'EOF'
github_org  = "<your-github-org>"
github_repo = "<your-github-repo>"
EOF

# 2. OIDC リソースを作成 (OIDC Provider + IAM Role + Policy)
terraform plan   # 3 to add を確認
terraform apply

# 3. 作成された IAM Role ARN を取得
terraform output github_actions_role_arn

# 4. GitHub リポジトリの Secrets に設定
gh secret set AWS_DEPLOY_ROLE_ARN --body "$(terraform output -raw github_actions_role_arn)"
```

作成されるリソース:

| リソース | 説明 |
|---|---|
| `aws_iam_openid_connect_provider` | GitHub OIDC プロバイダー (`token.actions.githubusercontent.com`) |
| `aws_iam_role` | `aws-monitoring-github-actions` — 信頼ポリシーで `repo:<org>/<repo>:*` に制限 |
| `aws_iam_role_policy` | ECR push, ECS UpdateService, Lambda UpdateFunctionCode 権限 |

#### 実行方法

1. GitHub リポジトリ → **Actions** → **Deploy** → **Run workflow**
2. デプロイ対象を選択して実行
   - **ECS アプリ**: Docker build → ECR push (`<sha>` + `latest`) → ECS force-new-deployment → 安定待ち
   - **Lambda**: `index.mjs` を zip → `aws lambda update-function-code`

### 手動デプロイ

ローカル環境から直接デプロイする場合の手順です。

```bash
# 1. ECR ログイン
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# 2. ビルド
docker build --platform linux/amd64 -t aws-monitoring:latest src/app/

# 3. タグ付け & Push
docker tag aws-monitoring:latest \
  <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/aws-monitoring:latest
docker push \
  <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/aws-monitoring:latest

# 4. サービス再デプロイ (新イメージでタスク入れ替え)
aws ecs update-service \
  --cluster aws-monitoring-cluster \
  --service aws-monitoring-svc \
  --force-new-deployment \
  --region us-east-1
```

デプロイ状況の確認:

```bash
aws ecs describe-services \
  --cluster aws-monitoring-cluster \
  --services aws-monitoring-svc \
  --region us-east-1 \
  --query 'services[0].{status:status,running:runningCount,desired:desiredCount}'
```

## インフラ変更

環境変数・スケーリング設定・リソース追加など、インフラ構成を変更する場合のみ Terraform を使用します。

```bash
cd src/infra/environments/prod
terraform plan
terraform apply
```

**注意:** Express Mode サービスに対して `terraform apply -replace` は使わないでください。サービス名が一定期間予約されるため、再作成に時間がかかります。

## ディレクトリ構成

```
managements_center/
├── README.md
├── .gitignore
├── .github/
│   └── workflows/
│       └── deploy.yml                # GitHub Actions (workflow_dispatch)
└── src/
    ├── infra/
    │   ├── modules/
    │   │   └── aws-monitoring/       # Terraform モジュール
    │   │       ├── main.tf           # required_providers + configuration_aliases
    │   │       ├── variables.tf      # モジュール入力変数
    │   │       ├── outputs.tf        # モジュール出力
    │   │       ├── ecs.tf            # ECR + CloudWatch LogGroup + Cluster
    │   │       ├── express.tf        # ECS Express Mode サービス
    │   │       ├── dynamodb.tf       # DynamoDB テーブル + GSI
    │   │       ├── eventbridge.tf    # EventBridge ルール + Lambda
    │   │       ├── iam.tf            # IAM ロール・ポリシー
    │   │       ├── vpc.tf            # VPC 参照
    │   │       └── src/lambda/
    │   │           └── index.mjs     # Lambda ハンドラー
    │   └── environments/
    │       └── prod/                 # 本番環境ラッパー
    │           ├── main.tf           # Provider + module 呼び出し + moved ブロック
    │           ├── variables.tf      # 環境変数 (デフォルト値あり)
    │           ├── outputs.tf        # module 出力の再エクスポート
    │           ├── oidc.tf           # GitHub OIDC Provider + IAM Role
    │           └── terraform.tfvars  # 実値 (gitignore 対象)
    └── app/                          # アプリケーション (Express.js + TypeScript)
        ├── Dockerfile
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── server.ts             # エントリポイント (Express + Basic Auth + Cron)
            ├── config.ts             # 環境変数設定
            ├── routes/
            │   ├── guardduty.ts      # GuardDuty API (GET/PATCH/POST sync)
            │   ├── health.ts         # Health API (GET/PATCH/POST sync)
            │   ├── dashboard.ts      # ダッシュボード集計 API
            │   └── accounts.ts       # アカウント名マッピング API
            ├── services/
            │   ├── aws-clients.ts    # AWS SDK クライアント初期化
            │   ├── guardduty-service.ts  # GuardDuty 同期・CRUD
            │   ├── health-service.ts     # Health 同期・CRUD
            │   └── scheduler.ts      # Cron スケジューラー
            └── public/
                ├── index.html        # SPA HTML
                ├── app.js            # フロントエンド JS
                └── style.css         # スタイルシート
```

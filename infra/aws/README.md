# AWS Terraform module — STUB

This is a placeholder. The current production target is **GCP**
(`infra/gcp/`). AWS lands when we have a council/enterprise customer
that specifically needs the AWS compliance story.

When we build it, the layout will be:

```
infra/aws/
├── versions.tf       providers, terraform >= 1.6, aws ~> 5.0
├── variables.tf      project, region, env, apex_domain, image, db tier
├── network.tf        VPC, public + private subnets, NAT, security groups
├── ecs.tf            Fargate cluster + service for the Node container
├── alb.tf            Application Load Balancer with HTTPS + wildcard cert
├── rds.tf            RDS Postgres in private subnets
├── s3.tf             Uploads bucket
├── cloudfront.tf     CDN in front of ALB + S3 (TLS termination at edge)
├── route53.tf        Apex + *.<apex_domain> records
├── acm.tf            Wildcard cert for the apex
├── ses.tf            Mail sending (DKIM, SPF, MAIL FROM)
├── secrets.tf        SSM Parameter Store for DATABASE_URL, RSVP_SECRET, etc.
└── outputs.tf
```

Code parity with the GCP module:

| Concern | GCP today | AWS later |
|---|---|---|
| Container | Cloud Run v2 | Fargate behind ALB |
| Database | Cloud SQL Postgres | RDS Postgres |
| Object storage | GCS | S3 |
| Wildcard TLS | LB + managed cert | ACM + CloudFront |
| Secrets | Secret Manager | SSM Parameter Store / Secrets Manager |
| Mail | console driver (todo) | SES |

The application code is already cloud-agnostic where it matters:

- `lib/storage.js` swaps via `STORAGE_DRIVER`
- `lib/mail.js` swaps via `MAIL_DRIVER`
- `DATABASE_URL` is just a Postgres connection string

When AWS lands we'll add an `s3` driver to `lib/storage.js` next to the
`gcs` driver, and an `ses` driver to `lib/mail.js`. No app refactor.

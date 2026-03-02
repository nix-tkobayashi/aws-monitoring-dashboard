resource "aws_secretsmanager_secret" "basic_auth" {
  name = "${var.app_name}/basic-auth"
}

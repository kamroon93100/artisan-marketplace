# Shared local PostgreSQL connection resolution for the verification runners.
#
# Wrangler reads this variable for local Hyperdrive development:
#   CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE
#
# The value comes from the caller's approved local secret source. It must
# never be committed, printed, or included in an exception message.
#
# Windows PowerShell 5.1 compatible.

function Get-HyperdriveLocalConnectionString {
  $variableName = 'CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE'
  $value = [Environment]::GetEnvironmentVariable($variableName, 'Process')

  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "$variableName is not set. Set it for the current PowerShell session from your approved local secret source, then rerun this local PostgreSQL proof."
  }

  $trimmed = $value.Trim()

  if ($trimmed -notmatch '^postgres(ql)?://') {
    throw "$variableName must contain a postgresql:// or postgres:// connection string."
  }

  return $trimmed
}

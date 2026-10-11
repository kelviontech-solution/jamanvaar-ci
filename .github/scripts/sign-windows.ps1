param([Parameter(Mandatory=$true)][string]$File)
$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath $File)) { throw 'Signing target does not exist' }
foreach ($name in @('WINDOWS_SIGNING_PFX_BASE64','WINDOWS_SIGNING_PASSWORD','WINDOWS_SIGNING_CERT_SHA256','WINDOWS_TIMESTAMP_URL')) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) { throw "Missing release signing configuration: $name" }
}
$timestamp = [Uri]$env:WINDOWS_TIMESTAMP_URL
if ($timestamp.Scheme -ne 'https') { throw 'Timestamp service must use HTTPS' }
$pfx = [Convert]::FromBase64String($env:WINDOWS_SIGNING_PFX_BASE64)
$certificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2
$certificate.Import($pfx, $env:WINDOWS_SIGNING_PASSWORD, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
try {
  $sha = [Security.Cryptography.SHA256]::Create()
  $fingerprint = ([BitConverter]::ToString($sha.ComputeHash($certificate.RawData))).Replace('-','')
  if ($fingerprint -ne $env:WINDOWS_SIGNING_CERT_SHA256.Replace(':','').ToUpperInvariant()) { throw 'Unexpected signing certificate' }
  if (!$certificate.HasPrivateKey -or $certificate.NotAfter -le (Get-Date)) { throw 'Release signing certificate is unavailable or expired' }
  $result = Set-AuthenticodeSignature -LiteralPath $File -Certificate $certificate -HashAlgorithm SHA256 -TimestampServer $timestamp.AbsoluteUri
  if ($result.Status -ne 'Valid') { throw "Release signature did not validate: $($result.Status)" }
} finally { $certificate.Dispose(); [Array]::Clear($pfx,0,$pfx.Length) }

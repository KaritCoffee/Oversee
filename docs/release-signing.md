# Release Signing

The desktop workflow builds Windows NSIS installers plus Apple silicon and Intel macOS DMGs. Tagged builds also create a GitHub release and publish SHA-256 checksum files.

## Current Trust Status

The installers are not code-signed or notarized unless the build environment is supplied with valid platform credentials. An unsigned Windows build can trigger SmartScreen. An unsigned or unnotarized macOS DMG can be blocked or described as damaged even when the file checksum is correct.

Do not describe an unsigned build as trusted or notarized. Share the matching `SHA256SUMS-*.txt` file so a recipient can verify transfer integrity.

## Production Requirements

- Windows releases need an Authenticode certificate and a protected signing step or signing service.
- macOS releases need an Apple Developer ID Application certificate, hardened runtime signing, and Apple notarization credentials.
- Release credentials belong in protected repository secrets or an external signing service, never in this repository or a bundled local config.

Data-provider API keys are runtime user settings, not release credentials, and are never embedded in distributable builds.

Until those credentials are configured, GitHub Actions artifacts are appropriate for testing but not a friction-free commercial distribution channel.

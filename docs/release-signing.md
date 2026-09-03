# Release Trust, Signing, and Updates

Oversee can build Windows and macOS installers in GitHub Actions, but the current repository has no production signing, notarization, or updater credentials. The workflow therefore labels every output as unsigned and publishes tagged builds as GitHub prereleases.

## Current Release Posture

The installer workflow performs these checks before publishing anything:

- The Git tag must be exactly `vX.Y.Z` and must match `package.json`.
- `npm run check` must confirm that all existing version metadata agrees.
- The runner architecture must match the architecture in the artifact name.
- Every installer is renamed with its version, platform, architecture, and `unsigned` status.
- Each platform receives a SHA-256 checksum file and an `UNSIGNED.txt` trust notice.
- A separate release job downloads all three build artifacts and recalculates every hash before publication.
- Only the release job receives `contents: write`; build jobs remain read-only.

Current CI outputs use these names:

| Platform | Installer |
| --- | --- |
| Windows x64 | `Oversee_<version>_windows-x64-unsigned-setup.exe` |
| macOS Apple silicon | `Oversee_<version>_macos-arm64-unsigned.dmg` |
| macOS Intel | `Oversee_<version>_macos-x64-unsigned.dmg` |

Manual workflow runs upload versioned artifacts for 30 days and do not create a GitHub release. A matching `vX.Y.Z` tag publishes the three installers, platform checksum files, trust notices, and an aggregate `Oversee_<version>_unsigned_SHA256SUMS.txt` file as an unsigned prerelease.

## What Unsigned Means

- Windows may show a Microsoft Defender SmartScreen warning because the installer has no Authenticode publisher signature.
- macOS may block the DMG or describe the app as damaged because it has no Apple Developer ID signature or notarization ticket.
- A SHA-256 match confirms that a downloaded file is byte-for-byte identical to the CI artifact. It does not prove publisher identity and is not a substitute for code signing.
- These builds are appropriate for controlled testing with recipients who understand the warning. They are not ready for low-friction commercial distribution.

Do not describe the current artifacts as signed, trusted, notarized, or automatically updateable.

## Verify A Download

Keep the installer and its matching checksum file in the same directory.

On Windows PowerShell:

```powershell
$installer = ".\Oversee_3.5.0_windows-x64-unsigned-setup.exe"
$checksum = ".\Oversee_3.5.0_windows-x64_unsigned_SHA256SUMS.txt"
$expected = ((Get-Content -LiteralPath $checksum -TotalCount 1) -split '\s+')[0].ToLowerInvariant()
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw "SHA-256 mismatch" }
"SHA-256 verified: $actual"
```

On macOS:

```bash
shasum -a 256 -c Oversee_3.5.0_macos-arm64_unsigned_SHA256SUMS.txt
```

Replace `3.5.0` and the architecture with the downloaded release. Do not open an installer if verification fails.

## Future Windows Signing

Production Windows releases need an Authenticode certificate or a managed signing service. Tauri supports certificate-based signing and custom `bundle.windows.signCommand` integrations, including managed services. Follow the current [Tauri Windows signing guide](https://v2.tauri.app/distribute/sign/windows/) when credentials are actually available.

Before enabling signed Windows releases:

1. Choose a certificate or managed signing provider and document who controls renewal and revocation.
2. Store credentials in a protected GitHub environment or signing service, never in source, workflow text, build logs, or app resources.
3. Restrict release approval and secret access to trusted maintainers and protected tags.
4. Sign the application and NSIS installer before checksums are generated.
5. Verify the final installer with `Get-AuthenticodeSignature` or `signtool verify /pa /v`.
6. Change artifact names and release text only after verification proves the build is signed.

The present workflow contains no certificate material and does not attempt a signing step.

## Future macOS Signing And Notarization

Direct macOS distribution requires an Apple Developer ID Application identity and notarization. Tauri can use an installed signing identity and either App Store Connect API credentials or Apple ID notarization credentials. Follow the current [Tauri macOS signing guide](https://v2.tauri.app/distribute/sign/macos/).

Before enabling signed macOS releases:

1. Enroll in the Apple Developer Program and create the appropriate Developer ID identity.
2. Import the certificate into an ephemeral CI keychain using protected secrets.
3. Provide notarization credentials only to a protected macOS release environment.
4. Sign, notarize, and staple each architecture-specific build before checksums are generated.
5. Verify the final app and DMG with `codesign --verify --deep --strict --verbose=2`, `spctl -a -vv`, and `xcrun stapler validate` as appropriate.
6. Change artifact names and release text only after all verification commands pass.

The present workflow has no Apple certificate, private key, team credentials, or notarization credentials. It does not use ad-hoc signing as a substitute for Developer ID distribution.

## Future Automatic Updater

`server-src/release-update.js` powers the bounded advisory check exposed by the local server and Settings UI. It safely compares the local version with a validated GitHub latest-release response, but it cannot download, execute, or install anything. Oversee checks at most once per day automatically and also provides a manual check in Settings.

Unsigned tagged builds are GitHub prereleases. GitHub's normal latest-release endpoint excludes prereleases, so these test installers will not be offered by a production advisory update check. That separation is intentional; a signed build should pass the promotion checklist before becoming a normal release.

A production updater is a separate project. Tauri's updater requires cryptographic update signatures and does not permit signature verification to be disabled. See the current [Tauri updater guide](https://v2.tauri.app/plugin/updater/).

The minimum updater rollout is:

1. Add the Tauri updater plugin, permissions, endpoint configuration, and user-facing consent flow.
2. Generate the updater key pair offline. Commit only the public key and keep the private key in protected secret storage with a recovery plan.
3. Enable `createUpdaterArtifacts` and provide the private signing key only in protected release jobs.
4. Publish every supported platform bundle with its generated `.sig` file.
5. Publish a complete HTTPS updater manifest only after all required artifacts and signatures have been verified.
6. Test update, cancellation, failed download, failed signature, relaunch, and rollback behavior on clean Windows and both macOS architectures.

Operating-system code signing and Tauri updater signing solve different problems. Production releases should use both. No updater key, updater endpoint, signed updater bundle, or automatic installation path exists in the current build.

## Promotion Checklist

An unsigned prerelease must not be relabeled as production merely by editing release notes. A future signed workflow should have a distinct trust state and must:

- Build from a protected, version-matched tag.
- Sign before hashing and uploading.
- Verify platform signatures and notarization after packaging.
- Verify updater signatures if updater artifacts are enabled.
- Preserve versioned installer names and aggregate checksums.
- Publish as a normal release only after every required platform succeeds.

Data-provider API keys are runtime user settings. They are separate from release credentials and must never be repurposed for signing or embedded in distributable builds.

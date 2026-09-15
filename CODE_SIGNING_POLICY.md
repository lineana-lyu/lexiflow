# Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io/), certificate
by [SignPath Foundation](https://signpath.org/).

LexiFlow's signed Windows releases will be produced from the public
[`lineana-lyu/lexiflow`](https://github.com/lineana-lyu/lexiflow) repository by
an automated GitHub Actions build. Until SignPath Foundation approves the
project and the signing integration is enabled, release artifacts remain
unsigned and must not be described as SignPath-signed.

## Team roles

- Committer and reviewer: [lineana-lyu](https://github.com/lineana-lyu)
- Signing approver: [lineana-lyu](https://github.com/lineana-lyu)

Changes submitted by other contributors require review by the maintainer before
merge. Every signing request requires manual approval by the signing approver.

## Release policy

Only release artifacts that meet all of the following conditions are eligible
for signing:

1. The source is a tagged commit on the protected release branch.
2. Repository checks and the Windows build workflow succeed.
3. The artifact is produced by the repository's automated build workflow.
4. Product name and version metadata match the source release.
5. The signing approver manually approves the signing request.

LexiFlow does not use the project signing identity for third-party or locally
modified binaries. Bundled third-party components retain their own licenses and
notices.

## Privacy

See the [LexiFlow Privacy Policy](PRIVACY.md). LexiFlow does not transfer user
information to networked systems unless the user requests a feature that needs
the external system described in that policy.

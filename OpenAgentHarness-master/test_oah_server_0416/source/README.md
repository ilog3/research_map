# source

This directory is the local source of truth for test data published to MinIO.

After editing anything here, run:

```bash
cd /Users/wumengsong/Code/OpenAgentHarness
export OAH_TEST_ROOT=/Users/wumengsong/Code/test_oah_server
pnpm storage:sync
```

## Mapping

| Local directory | Bucket prefix | Purpose |
| --- | --- | --- |
| `workspaces/` | `workspace/` | Workspace runtime data |
| `chat/` | `chat/` | Chat-mode workspace data |
| `templates/` | `template/` | Workspace templates |
| `models/` | `model/` | Model config YAML files |
| `tools/` | `tool/` | Tool config and tool server definitions |
| `skills/` | `skill/` | Reusable skill packages |
| `archives/` | `archive/` | Archive files and snapshots |

## Editing Rules

- Only treat this directory as editable source data.
- Do not recreate `local/` mirrors here. That old host-mode layout is retired.
- Do not store MinIO runtime data here. Docker volumes hold actual MinIO state now.
- `pnpm storage:sync` uses `--delete`, so remote files missing here will be deleted from the bucket.

## Notes

- `templates/`, `tools/`, and `skills/` are mounted directly into the OAH container through the Docker `rclone` volume plugin.
- `workspaces/` and `chat/` are still synced through OAH object storage logic and live on Docker local volumes at runtime.
- `chat/chat/` looks odd, but it matches the current test data layout and bucket prefix. Leave it as is unless we intentionally redesign chat fixtures.

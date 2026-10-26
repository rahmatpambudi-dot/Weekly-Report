name: Auto-update data_embed.js

on:
  schedule:
    # Every 2 hours (minute 17 on purpose: GitHub delays jobs queued exactly on the hour).
    # The source dashboards (Insentif / SILK / Productivity) publish at different times of the
    # day, so a once-a-day run leaves the dashboard up to ~24h behind.
    - cron: '17 */2 * * *'
  workflow_dispatch: {}  # manual trigger from the Actions tab

permissions:
  contents: write

# Never run two refreshes at once (e.g. a scheduled run overlapping a manual one).
concurrency:
  group: update-data-embed
  cancel-in-progress: false

jobs:
  update-data:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout repo
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Regenerate data_embed.js from source dashboards (3 attempts)
        run: |
          for i in 1 2 3; do
            if python3 scripts/generate_data_embed.py; then
              exit 0
            fi
            echo "Attempt $i failed, retrying in 30s..."
            sleep 30
          done
          echo "::error::generate_data_embed.py failed 3 times in a row (a source dashboard is probably unreachable)"
          exit 1

      - name: Commit and push if data changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          # Commit only when data_embed.js actually differs, so most 2-hourly runs are no-ops.
          if git diff --quiet -- data_embed.js; then
            echo "No changes to data_embed.js, skipping commit."
            exit 0
          fi
          git add data_embed.js
          git commit -m "Auto-update data_embed.js ($(date -u +'%Y-%m-%d %H:%M UTC'))"
          # If someone pushed in the meantime, rebase on top instead of failing the run.
          git pull --rebase origin "${GITHUB_REF_NAME}"
          git push

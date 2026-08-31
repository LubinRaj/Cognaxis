#!/usr/bin/env bash
set -euo pipefail

failure=0

if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  tracked_files="$(git ls-files)"

  if printf '%s\n' "$tracked_files" | grep -E '(^|/)(\.env($|\.)|[^/]*(service[-_]?account|firebase-adminsdk)[^/]*\.json$|[^/]+\.(pem|p12|pfx|key)$)' | grep -Ev '(^|/)\.env\.example$'; then
    echo "ERROR: a tracked filename appears to contain secrets or private credentials." >&2
    failure=1
  fi

  search_paths=(
    ':!scripts/security/check-repository.sh'
    ':!.githooks/commit-msg'
  )

  if git grep -I -n -E 'AIza[0-9A-Za-z_-]{35}|-----BEGIN ([A-Z ]+ )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{30,}|ya29\.[0-9A-Za-z_-]+' -- . "${search_paths[@]}"; then
    echo "ERROR: a tracked file contains a value resembling a credential." >&2
    failure=1
  fi

  if git grep -I -n -Ei '^[[:space:]]*(Co-authored-by|Generated-by|Developed-by|AI-assisted-by):' -- . "${search_paths[@]}"; then
    echo "ERROR: repository content contains a prohibited attribution trailer." >&2
    failure=1
  fi
else
  if find . -maxdepth 3 -not -path '*/.*' -not -path './node_modules*' -not -path './dist*' | grep -E '(^|/)(\.env($|\.)|[^/]*(service[-_]?account|firebase-adminsdk)[^/]*\.json$|[^/]+\.(pem|p12|pfx|key)$)' | grep -Ev '(^|/)\.env\.example$'; then
    echo "ERROR: a workspace filename appears to contain secrets or private credentials." >&2
    failure=1
  fi

  if grep -r -I -n -E 'AIza[0-9A-Za-z_-]{35}|-----BEGIN ([A-Z ]+ )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{30,}|ya29\.[0-9A-Za-z_-]+' --exclude-dir={node_modules,dist,dist-server} --exclude=check-repository.sh --exclude=commit-msg .; then
    echo "ERROR: a workspace file contains a value resembling a credential." >&2
    failure=1
  fi

  if grep -r -I -n -Ei '^[[:space:]]*(Co-authored-by|Generated-by|Developed-by|AI-assisted-by):' --exclude-dir={node_modules,dist,dist-server} --exclude=check-repository.sh --exclude=commit-msg .; then
    echo "ERROR: workspace content contains a prohibited attribution trailer." >&2
    failure=1
  fi
fi

if ! node scripts/security/inspect-client-bundle.mjs; then
  failure=1
fi

if [[ "$failure" -ne 0 ]]; then
  exit 1
fi

echo "Repository policy checks passed."

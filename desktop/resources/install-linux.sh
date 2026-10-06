#!/usr/bin/env bash
set -euo pipefail
# Installer bundled with a publisher-verified Linux release. No Node or npm needed.
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
prefix="${HOME}/.local"
if (( $# )); then
  if [[ $# != 2 || $1 != --prefix || $2 != /* ]]; then
    printf '%s\n' 'Usage: ./install.sh [--prefix /absolute/directory]' >&2; exit 1
  fi
  prefix="$2"
fi
root="$prefix/share/tern"
mkdir -p -- "$root/releases" "$prefix/bin" "$prefix/share/applications"
root="$(realpath -- "$root")"
case "$source_dir/" in "$root/"*) printf '%s\n' 'Extract the release outside its installation directory.' >&2; exit 1;; esac
[[ -x "$source_dir/Tern" && -f "$source_dir/resources/app.asar" && -f "$source_dir/resources/security.json" ]]
launcher="$prefix/bin/tern"
entry="$prefix/share/applications/tern.desktop"
for owned in "$launcher" "$entry"; do
  if [[ -e "$owned" || -L "$owned" ]]; then
    [[ -f "$owned" && ! -L "$owned" ]] && grep -q '^# Managed by Tern installer$' "$owned" || {
      printf 'Refusing to replace an unmanaged file: %s\n' "$owned" >&2; exit 1;
    }
  fi
done
lock="$root/.install-lock"
mkdir -- "$lock" || { printf '%s\n' 'Another installer is running, or an interrupted installation left a lock.' >&2; exit 1; }
staging="$(mktemp -d "$root/releases/.staging-XXXXXXXX")"
cleanup() { rm -rf -- "$staging"; rm -f -- "$root/.current-install" "$root/.previous-install"; rmdir -- "$lock"; }
trap cleanup EXIT
cp -a --reflink=auto -- "$source_dir/." "$staging/"
id="@VERSION@-$(date +%s)-${staging##*.staging-}"
release="$root/releases/$id"
mv -- "$staging" "$release"
if [[ -L "$root/current" ]]; then
  old="$(readlink -- "$root/current")"
  [[ "$old" =~ ^releases/[a-zA-Z0-9._-]+$ ]] || { printf '%s\n' 'Invalid installed release link.' >&2; exit 1; }
  ln -s -- "$old" "$root/.previous-install"
  mv -Tf -- "$root/.previous-install" "$root/previous"
fi
{
  printf '%s\n' '#!/usr/bin/env bash' '# Managed by Tern installer' 'set -euo pipefail' 'unset ELECTRON_RUN_AS_NODE'
  printf 'release="$(readlink -f -- %q)"\n' "$root/current"
  printf '%s\n' 'cd -- "$release"' 'exec "$release/Tern" "$@"'
} > "$lock/launcher"
chmod 755 "$lock/launcher"
mv -f -- "$lock/launcher" "$launcher"
cp -- "$source_dir/resources/tern-icon.png" "$root/tern-icon.png"
exec_path="${launcher//\\/\\\\}"; exec_path="${exec_path//\"/\\\"}"; exec_path="${exec_path//\$/\\\$}"; exec_path="${exec_path//\`/\\\`}"; exec_path="${exec_path//%/%%}"
{
  printf '%s\n' '[Desktop Entry]' '# Managed by Tern installer' 'Type=Application' 'Name=Tern' 'Comment=Put tasks aside and resume their pages'
  printf 'Exec="%s" %%U\nIcon=%s\n' "$exec_path" "${root}/tern-icon.png"
  printf '%s\n' 'Terminal=false' 'Categories=Network;WebBrowser;' 'MimeType=text/html;x-scheme-handler/http;x-scheme-handler/https;' 'StartupWMClass=Tern'
} > "$lock/desktop-entry"
mv -f -- "$lock/desktop-entry" "$entry"
ln -s -- "releases/$id" "$root/.current-install"
mv -Tf -- "$root/.current-install" "$root/current"
if command -v update-desktop-database >/dev/null; then update-desktop-database "$prefix/share/applications" || true; fi
printf 'Installed Tern @VERSION@. Launch %s or use your app menu.\nQuit and reopen Tern to use this release.\n' "$launcher"

#!/usr/bin/env bash
#
# Builds the debug APK and leaves a copy at ./app_debug.apk.
#
#   ./build_debug.sh                # build
#   ./build_debug.sh --offline      # any extra argument goes straight to Gradle
#
# Two things this exists to get right, because both fail with a message that points
# somewhere else:
#
#   * A JDK. Gradle 9 refuses to start on Java 8, and this machine's default `java`
#     is 8, so the error reads "Gradle requires JVM 17 or later to run" while nothing
#     about the project is wrong. The first JDK found that is 17 or newer is used;
#     an existing JAVA_HOME wins if it qualifies.
#   * Where the APK landed. The module and the file name are stable, so the copy gets
#     one name in one place instead of being hunted for under build/outputs.

set -euo pipefail

cd "$(dirname "$0")"

DEST=app_debug.apk
MODULE=${MODULE:-app}

java_major() {
  "$1" -version 2>&1 | awk -F'"' '/version/ { print $2; exit }' |
    awk -F. '{ print ($1 == 1 ? $2 : $1) }'
}

pick_java_home() {
  if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ] &&
    [ "$(java_major "$JAVA_HOME/bin/java")" -ge 17 ] 2>/dev/null; then
    printf '%s\n' "$JAVA_HOME"
    return 0
  fi

  for candidate in \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    /usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
    /usr/local/opt/openjdk \
    /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
    /opt/homebrew/opt/openjdk \
    "$HOME"/Library/Java/JavaVirtualMachines/*/Contents/Home; do
    [ -x "$candidate/bin/java" ] || continue
    if [ "$(java_major "$candidate/bin/java")" -ge 17 ] 2>/dev/null; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

if JDK=$(pick_java_home); then
  export JAVA_HOME="$JDK"
  echo "JDK: $JAVA_HOME (Java $(java_major "$JAVA_HOME/bin/java"))"
else
  echo "No JDK 17 or newer found; using the java on PATH (Gradle will refuse it)." >&2
fi

echo "Building assembleDebug…"
./gradlew assembleDebug "$@"

APK=""
for f in "$MODULE"/build/outputs/apk/debug/*.apk; do
  if [ -f "$f" ]; then
    APK=$f
    break
  fi
done

# A project whose application module is not called `app` still gets a usable result.
if [ -z "$APK" ]; then
  for f in */build/outputs/apk/debug/*.apk; do
    if [ -f "$f" ]; then
      APK=$f
      break
    fi
  done
fi

if [ -z "$APK" ]; then
  echo "Build finished but no debug APK was found under $MODULE/build/outputs/apk/debug/." >&2
  exit 1
fi

cp -f "$APK" "$DEST"

printf '\nAPK:     %s (%s)\n' "$PWD/$DEST" "$(du -h "$DEST" | cut -f1)"
printf 'Install: adb install -r %s\n' "$PWD/$DEST"

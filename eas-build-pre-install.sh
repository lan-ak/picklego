#!/bin/bash
# EAS Build lifecycle hook: runs before dependencies are installed.
# Only applies to iOS builds on the EAS build server.

if [[ "$EAS_BUILD_PLATFORM" == "ios" ]]; then
  echo "[EAS] Installing xcodeproj gem for watch target setup..."
  gem install xcodeproj
fi

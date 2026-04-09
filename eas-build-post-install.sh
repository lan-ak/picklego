#!/bin/bash
# EAS Build lifecycle hook: runs after dependencies are installed (including pod install).
# Fixes watch target Xcode file references and adds Embed Watch Content build phase.

if [[ "$EAS_BUILD_PLATFORM" == "ios" ]]; then
  echo "[EAS] Fixing PickleGoWatch target references..."
  ruby scripts/fix-watch-target.rb
fi

#!/usr/bin/env ruby
# Fix PickleGoWatch target file references and group structure in the Xcode project.
# Run from project root: ruby scripts/fix-watch-target.rb

require 'xcodeproj'
require 'pathname'

project_path = File.join(__dir__, '..', 'ios', 'PickleGo.xcodeproj')
project = Xcodeproj::Project.open(project_path)
ios_root = File.join(__dir__, '..', 'ios')

# Find the watch target
watch_target = project.targets.find { |t| t.name == 'PickleGoWatch' }
unless watch_target
  puts "ERROR: PickleGoWatch target not found"
  exit 1
end

# Find the iOS target
ios_target = project.targets.find { |t| t.name == 'PickleGo' }

# Remove any existing PickleGoWatch group
existing_group = project.main_group.groups.find { |g| g.name == 'PickleGoWatch' }
existing_group&.remove_from_project

# Remove "Recovered References" group if it exists
recovered = project.main_group.groups.find { |g| g.name == 'Recovered References' }
recovered&.remove_from_project

# Clear existing build phases for watch target
watch_target.source_build_phase.files.each { |f| f.remove_from_project }
watch_target.resources_build_phase.files.each { |f| f.remove_from_project }

# Create proper group hierarchy
watch_group = project.main_group.new_group('PickleGoWatch', 'PickleGoWatch')

# Discover Swift files and font files dynamically
watch_dir = File.join(ios_root, 'PickleGoWatch')

swift_paths = Dir.glob(File.join(watch_dir, '**', '*.swift')).reject { |f| f.include?('/Tests/') }.sort
font_paths = Dir.glob(File.join(watch_dir, '*.ttf')).sort

# Track created subgroups to avoid duplicates
subgroups = {}

# Add Swift source files
swift_paths.each do |full_path|
  rel_path = Pathname.new(full_path).relative_path_from(Pathname.new(watch_dir)).to_s
  subdir = File.dirname(rel_path)
  filename = File.basename(rel_path)

  group = if subdir == '.'
    watch_group
  else
    subgroups[subdir] ||= watch_group.new_group(subdir, subdir)
  end

  file_ref = group.new_file(filename)
  watch_target.source_build_phase.add_file_reference(file_ref)

  # Remove from iOS target if accidentally added
  ios_target&.source_build_phase&.files&.each do |bf|
    if bf.file_ref&.path&.end_with?(filename)
      bf.remove_from_project
    end
  end

  puts "  Added #{rel_path} to PickleGoWatch sources"
end

# Add font files as resources
font_paths.each do |full_path|
  filename = File.basename(full_path)
  file_ref = watch_group.new_file(filename)
  watch_target.resources_build_phase.add_file_reference(file_ref)
  puts "  Added #{filename} to PickleGoWatch resources"
end

# Add Assets.xcassets as resource
assets_path = File.join(ios_root, 'PickleGoWatch', 'Assets.xcassets')
if File.exist?(assets_path)
  file_ref = watch_group.new_file('Assets.xcassets')
  watch_target.resources_build_phase.add_file_reference(file_ref)
  puts "  Added Assets.xcassets to PickleGoWatch resources"
end

# Add Info.plist and entitlements (not in build phases, just referenced)
['Info.plist', 'PickleGoWatch.entitlements'].each do |filename|
  full_path = File.join(ios_root, 'PickleGoWatch', filename)
  if File.exist?(full_path)
    watch_group.new_file(filename)
    puts "  Added #{filename} reference"
  end
end

# Add "Embed Watch Content" script phase to the iOS target.
# Uses a script phase (not CopyFiles with product reference) because a product
# reference creates an implicit dependency that breaks simulator builds.
# The scheme entry builds the watch target during archive, and this script copies it.
if ios_target
  embed_phase_name = 'Embed Watch Content'
  # Remove any old phases (script or copy)
  ios_target.build_phases.select { |bp|
    bp.respond_to?(:name) && (bp.name == embed_phase_name || bp.name == 'Build and Embed Watch Content')
  }.each(&:remove_from_project)

  embed_phase = project.new(Xcodeproj::Project::Object::PBXShellScriptBuildPhase)
  embed_phase.name = embed_phase_name
  embed_phase.shell_script = <<~'SCRIPT'
    # Only run during archive (ACTION=install)
    if [ "${ACTION}" != "install" ]; then
      exit 0
    fi

    WATCH_BUILD_DIR="${BUILD_DIR}/watchos-build"
    echo "Building PickleGoWatch for watchOS..."
    xcodebuild build \
      -project "${PROJECT_DIR}/PickleGo.xcodeproj" \
      -target PickleGoWatch \
      -configuration "${CONFIGURATION}" \
      -sdk watchos \
      ONLY_ACTIVE_ARCH=NO \
      SYMROOT="${WATCH_BUILD_DIR}" \
      DEVELOPMENT_TEAM="${DEVELOPMENT_TEAM}" \
      CODE_SIGN_STYLE="Automatic" \
      CODE_SIGN_IDENTITY="Apple Development" \
      2>&1

    if [ $? -ne 0 ]; then
      echo "error: PickleGoWatch build failed"
      exit 1
    fi

    WATCH_APP="${WATCH_BUILD_DIR}/${CONFIGURATION}-watchos/PickleGoWatch.app"
    if [ ! -d "${WATCH_APP}" ]; then
      echo "error: PickleGoWatch.app not found at ${WATCH_APP}"
      exit 1
    fi

    DEST="${TARGET_BUILD_DIR}/${CONTENTS_FOLDER_PATH}/Watch"
    mkdir -p "${DEST}"
    cp -RL "${WATCH_APP}" "${DEST}/PickleGoWatch.app"
    echo "Embedded PickleGoWatch.app into Watch/"
  SCRIPT
  embed_phase.shell_path = '/bin/sh'
  ios_target.build_phases << embed_phase
  puts "  Added '#{embed_phase_name}' script phase to PickleGo target"

  # Remove PickleGoWatch from the scheme — it's built by the script phase above.
  # The archive uses -destination generic/platform=iOS which would force the watch
  # target to build with the iOS SDK if it were in the scheme.
  scheme_path = File.join(ios_root, 'PickleGo.xcodeproj', 'xcshareddata', 'xcschemes', 'PickleGo.xcscheme')
  if File.exist?(scheme_path)
    require 'rexml/document'
    doc = REXML::Document.new(File.read(scheme_path))
    build_action = doc.elements['//BuildAction']
    if build_action
      build_action.elements.each('BuildActionEntries/BuildActionEntry') do |entry|
        entry.elements.each('BuildableReference') do |ref|
          if ref.attributes['BlueprintName'] == 'PickleGoWatch'
            entry.parent.delete_element(entry)
          end
        end
      end
      File.write(scheme_path, doc.to_s)
      puts "  Removed PickleGoWatch from scheme"
    end
  end
end

# Apply watch build settings
watch_target.build_configurations.each do |config|
  config.build_settings['SDKROOT'] = 'watchos'
  config.build_settings['WATCHOS_DEPLOYMENT_TARGET'] = '10.0'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '4'
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'PickleGoWatch/PickleGoWatch.entitlements'
  config.build_settings['INFOPLIST_FILE'] = 'PickleGoWatch/Info.plist'
  config.build_settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  config.build_settings['SKIP_INSTALL'] = 'NO'
end

# Save
project.save
puts "\nDone! PickleGoWatch file references fixed."

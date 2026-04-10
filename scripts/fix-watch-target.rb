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
    if [ "${ACTION}" != "install" ]; then
      exit 0
    fi

    DEST="${TARGET_BUILD_DIR}/${CONTENTS_FOLDER_PATH}/Watch"

    # With SKIP_INSTALL=NO, Xcode puts the watch app in the install dir
    INSTALL_APP="${DSTROOT}/Applications/PickleGoWatch.app"
    # Fallback: check the build products directory
    BUILD_APP="${BUILD_DIR}/${CONFIGURATION}-watchos/PickleGoWatch.app"

    if [ -d "${INSTALL_APP}" ] && [ ! -L "${INSTALL_APP}" ]; then
      WATCH_APP="${INSTALL_APP}"
    elif [ -e "${BUILD_APP}" ]; then
      # Resolve symlinks and copy the real files
      WATCH_APP="$(cd "${BUILD_APP}" 2>/dev/null && pwd -P)" || WATCH_APP="${BUILD_APP}"
    else
      echo "warning: PickleGoWatch.app not found"
      exit 0
    fi

    mkdir -p "${DEST}"
    # Use -RL to dereference symlinks during copy
    cp -RL "${WATCH_APP}" "${DEST}/PickleGoWatch.app"
    echo "Embedded PickleGoWatch.app into Watch/"
  SCRIPT
  embed_phase.shell_path = '/bin/sh'
  ios_target.build_phases << embed_phase
  puts "  Added '#{embed_phase_name}' script phase to PickleGo target"

  # Add PickleGoWatch to the PickleGo scheme for archive builds only.
  # Local xcodebuild archive (without -destination flag) resolves the watch target
  # correctly using its SDKROOT=watchos build setting. The scheme entry tells
  # xcodebuild to build the watch target during archive.
  scheme_path = File.join(ios_root, 'PickleGo.xcodeproj', 'xcshareddata', 'xcschemes', 'PickleGo.xcscheme')
  if File.exist?(scheme_path)
    require 'rexml/document'
    doc = REXML::Document.new(File.read(scheme_path))
    build_action = doc.elements['//BuildAction']
    if build_action
      # Remove any existing watch entry first
      build_action.elements.each('BuildActionEntries/BuildActionEntry') do |entry|
        entry.elements.each('BuildableReference') do |ref|
          if ref.attributes['BlueprintName'] == 'PickleGoWatch'
            entry.parent.delete_element(entry)
          end
        end
      end

      # Add fresh entry — archive only
      entries = build_action.elements['BuildActionEntries']
      entry = entries.add_element('BuildActionEntry')
      entry.add_attributes({
        'buildForTesting' => 'NO',
        'buildForRunning' => 'NO',
        'buildForProfiling' => 'NO',
        'buildForArchiving' => 'YES',
        'buildForAnalyzing' => 'NO'
      })
      ref = entry.add_element('BuildableReference')
      ref.add_attributes({
        'BuildableIdentifier' => 'primary',
        'BlueprintIdentifier' => watch_target.uuid,
        'BuildableName' => 'PickleGoWatch.app',
        'BlueprintName' => 'PickleGoWatch',
        'ReferencedContainer' => 'container:PickleGo.xcodeproj'
      })
      File.write(scheme_path, doc.to_s)
      puts "  Added PickleGoWatch to scheme (archive only)"
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

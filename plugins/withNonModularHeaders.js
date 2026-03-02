const { withPodfile } = require("@expo/config-plugins");

/**
 * Adds CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES to RNFB pod
 * targets, fixing "include of non-modular header inside framework module" errors
 * when useFrameworks: "static" is enabled.
 */
module.exports = function withNonModularHeaders(config) {
  return withPodfile(config, (config) => {
    const podfile = config.modResults.contents;

    const snippet = `
    # Fix non-modular header errors for react-native-firebase with useFrameworks: "static"
    installer.pods_project.targets.each do |target|
      if target.name.start_with?('RNFB')
        target.build_configurations.each do |bc|
          bc.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
        end
      end
    end`;

    config.modResults.contents = podfile.replace(
      "post_install do |installer|",
      `post_install do |installer|${snippet}`
    );

    return config;
  });
};

Pod::Spec.new do |s|
  s.name         = "WatchSync"
  s.version      = "1.0.0"
  s.summary      = "WatchConnectivity bridge for PickleGo"
  s.homepage     = "https://github.com/picklego"
  s.license      = "MIT"
  s.author       = "PickleGo"
  s.source       = { :git => "" }
  s.platform     = :ios, "16.0"
  s.swift_version = "5.0"
  s.source_files = "*.swift"
  s.frameworks   = "WatchConnectivity"

  s.dependency "ExpoModulesCore"
end

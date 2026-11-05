require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# Módulo nativo mínimo del popup-sdk en React Native (iOS): background task para que el cierre
# de la sesión salga al pasar a background (DD-55). Lo enlaza el autolinking; en web no existe.
Pod::Spec.new do |s|
  s.name         = "MagicfeedbackPopupSdk"
  s.version      = package["version"]
  s.summary      = "Deepdots popup SDK: iOS background task for analytics requests (React Native)."
  s.homepage     = "https://github.com/MagicFeedback/deepdots-popup-sdk"
  s.license      = package["license"] || "UNLICENSED"
  s.author       = "Deepdots"
  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => "https://github.com/MagicFeedback/deepdots-popup-sdk.git", :tag => "v#{s.version}" }
  s.source_files = "ios/**/*.{h,m}"
  s.dependency "React-Core"
end

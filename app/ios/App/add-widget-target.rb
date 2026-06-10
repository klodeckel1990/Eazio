# One-off project surgery: adds the TellerwertWidget extension target and the
# locally defined Capacitor plugin files to App.xcodeproj. Idempotent — safe
# to re-run after `cap sync` (which never touches custom targets).
require 'xcodeproj'

project = Xcodeproj::Project.open('App.xcodeproj')
app_target = project.targets.find { |t| t.name == 'App' }
raise 'App target missing' unless app_target

app_group = project.main_group['App']

# --- local plugin files into the App target -----------------------------
%w[SharedAuthPlugin.swift MainViewController.swift].each do |name|
  next if app_group.files.any? { |f| f.path == name }
  ref = app_group.new_reference(name)
  app_target.source_build_phase.add_file_reference(ref)
  puts "added #{name} to App target"
end

# App entitlements (app group)
app_target.build_configurations.each do |config|
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
end

# --- widget extension target ---------------------------------------------
unless project.targets.any? { |t| t.name == 'TellerwertWidget' }
  widget = project.new_target(:app_extension, 'TellerwertWidget', :ios, '17.0')

  group = project.main_group.find_subpath('TellerwertWidget', true)
  group.set_source_tree('<group>')
  group.set_path('TellerwertWidget')
  swift_ref = group.new_reference('TellerwertWidget.swift')
  widget.source_build_phase.add_file_reference(swift_ref)

  widget.build_configurations.each do |config|
    bs = config.build_settings
    bs['PRODUCT_BUNDLE_IDENTIFIER'] = 'de.tellerwert.app.TellerwertWidget'
    bs['INFOPLIST_FILE'] = 'TellerwertWidget/Info.plist'
    bs['GENERATE_INFOPLIST_FILE'] = 'NO'
    bs['CODE_SIGN_ENTITLEMENTS'] = 'TellerwertWidget/TellerwertWidget.entitlements'
    bs['CODE_SIGN_STYLE'] = 'Automatic'
    bs['SWIFT_VERSION'] = '5.0'
    bs['TARGETED_DEVICE_FAMILY'] = '1,2'
    bs['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
    bs['CURRENT_PROJECT_VERSION'] = '1'
    bs['MARKETING_VERSION'] = '1.0'
    bs['PRODUCT_NAME'] = '$(TARGET_NAME)'
    bs['SKIP_INSTALL'] = 'YES'
    bs['ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME'] = ''
    bs['ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME'] = ''
  end

  # embed into the app
  app_target.add_dependency(widget)
  embed = app_target.copy_files_build_phases.find { |p| p.symbol_dst_subfolder_spec == :plug_ins }
  unless embed
    embed = app_target.new_copy_files_build_phase('Embed Foundation Extensions')
    embed.symbol_dst_subfolder_spec = :plug_ins
  end
  build_file = embed.add_file_reference(widget.product_reference)
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
  puts 'added TellerwertWidget target'
end

project.save
puts 'project saved'

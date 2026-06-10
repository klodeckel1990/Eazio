# One-off project surgery: adds the TellerwertShare extension target and the
# shared PendingShare.swift hand-off helper. Idempotent.
require 'xcodeproj'

project = Xcodeproj::Project.open('App.xcodeproj')
app_target = project.targets.find { |t| t.name == 'App' }
raise 'App target missing' unless app_target

# PendingShare.swift into the App target
app_group = project.main_group['App']
unless app_group.files.any? { |f| f.path == 'PendingShare.swift' }
  ref = app_group.new_reference('PendingShare.swift')
  app_target.source_build_phase.add_file_reference(ref)
  puts 'added PendingShare.swift to App target'
end
pending_ref = app_group.files.find { |f| f.path == 'PendingShare.swift' }

unless project.targets.any? { |t| t.name == 'TellerwertShare' }
  share = project.new_target(:app_extension, 'TellerwertShare', :ios, '17.0')

  group = project.main_group.find_subpath('TellerwertShare', true)
  group.set_source_tree('<group>')
  group.set_path('TellerwertShare')
  swift_ref = group.new_reference('ShareViewController.swift')
  share.source_build_phase.add_file_reference(swift_ref)
  share.source_build_phase.add_file_reference(pending_ref) # shared hand-off helper

  share.build_configurations.each do |config|
    bs = config.build_settings
    bs['PRODUCT_BUNDLE_IDENTIFIER'] = 'de.tellerwert.app.TellerwertShare'
    bs['INFOPLIST_FILE'] = 'TellerwertShare/Info.plist'
    bs['GENERATE_INFOPLIST_FILE'] = 'NO'
    bs['CODE_SIGN_ENTITLEMENTS'] = 'TellerwertShare/TellerwertShare.entitlements'
    bs['CODE_SIGN_STYLE'] = 'Automatic'
    bs['SWIFT_VERSION'] = '5.0'
    bs['TARGETED_DEVICE_FAMILY'] = '1,2'
    bs['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
    bs['CURRENT_PROJECT_VERSION'] = '1'
    bs['MARKETING_VERSION'] = '1.0'
    bs['PRODUCT_NAME'] = '$(TARGET_NAME)'
    bs['SKIP_INSTALL'] = 'YES'
  end

  app_target.add_dependency(share)
  embed = app_target.copy_files_build_phases.find { |p| p.symbol_dst_subfolder_spec == :plug_ins }
  unless embed
    embed = app_target.new_copy_files_build_phase('Embed Foundation Extensions')
    embed.symbol_dst_subfolder_spec = :plug_ins
  end
  build_file = embed.add_file_reference(share.product_reference)
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
  puts 'added TellerwertShare target'
end

project.save
puts 'project saved'

import UIKit
import Capacitor

/// Registers locally defined Capacitor plugins (no npm package needed).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SharedAuthPlugin())
    }
}

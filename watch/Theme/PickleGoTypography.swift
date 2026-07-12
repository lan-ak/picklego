import SwiftUI
import WatchKit

enum PickleGoFont {
    static let regular = "Fredoka-Regular"
    static let medium = "Fredoka-Medium"
    static let semiBold = "Fredoka-SemiBold"
    static let bold = "Fredoka-Bold"

    /// Screen-width-proportional scale so type fills — but never clips — on every
    /// watch size from the 40mm up through the 42mm/46mm Series 10/11 displays.
    /// Reference is the 45mm (198pt wide); clamped so tiny and huge screens stay sane.
    static let scale: CGFloat = {
        let width = WKInterfaceDevice.current().screenBounds.width
        guard width > 0 else { return 1 }
        return min(max(width / 198, 0.82), 1.15)
    }()

    private static func scaled(_ size: CGFloat) -> CGFloat { (size * scale).rounded() }

    static func scoreCallout() -> Font { .custom(bold, size: scaled(28)) }
    static func scoreDigit() -> Font { .custom(bold, size: scaled(48)) }
    static func teamName() -> Font { .custom(semiBold, size: scaled(14)) }
    static func gameIndicator() -> Font { .custom(medium, size: scaled(12)) }
    static func button() -> Font { .custom(semiBold, size: scaled(16)) }
    static func title() -> Font { .custom(semiBold, size: scaled(18)) }
    static func body() -> Font { .custom(medium, size: scaled(14)) }
    static func headline() -> Font { .custom(bold, size: scaled(20)) }
    static func caption() -> Font { .custom(regular, size: scaled(12)) }
}

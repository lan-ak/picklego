import SwiftUI

enum PickleGoFont {
    static let regular = "Fredoka-Regular"
    static let medium = "Fredoka-Medium"
    static let semiBold = "Fredoka-SemiBold"
    static let bold = "Fredoka-Bold"

    static func scoreCallout() -> Font { .custom(bold, size: 28) }
    static func scoreDigit() -> Font { .custom(bold, size: 48) }
    static func teamName() -> Font { .custom(semiBold, size: 14) }
    static func gameIndicator() -> Font { .custom(medium, size: 12) }
    static func button() -> Font { .custom(semiBold, size: 16) }
    static func title() -> Font { .custom(semiBold, size: 18) }
    static func body() -> Font { .custom(medium, size: 14) }
    static func headline() -> Font { .custom(bold, size: 20) }
    static func caption() -> Font { .custom(regular, size: 12) }
}

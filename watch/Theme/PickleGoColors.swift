import SwiftUI

extension Color {
    static let pickleGreen = Color(hex: "#4CAF50")
    static let powerYellow = Color(hex: "#FFC107")
    static let courtBlue = Color(hex: "#2196F3")
    static let deepAsphalt = Color(hex: "#333333")
    static let courtGray = Color(hex: "#F5F5F5")
    static let winWhite = Color(hex: "#FFFFFF")
    static let error = Color(hex: "#F44336")
    static let win = Color(hex: "#4CAF50")
    static let loss = Color(hex: "#F44336")
    static let gray200 = Color(hex: "#E0E0E0")
    static let gray400 = Color(hex: "#999999")
    static let gray500 = Color(hex: "#666666")

    // Watch-specific semantic colors
    static let cardBackground = Color.white.opacity(0.08)
    static let cardBorder = Color.white.opacity(0.15)

    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6: (a, r, g, b) = (255, (int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
        case 8: (a, r, g, b) = ((int >> 24) & 0xFF, (int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
        default: (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(.sRGB, red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255, opacity: Double(a) / 255)
    }
}

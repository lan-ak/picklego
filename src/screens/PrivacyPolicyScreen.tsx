import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Layout from '../components/Layout';
import { colors, typography, spacing } from '../theme';

const PrivacyPolicyScreen: React.FC = () => {
  return (
    <Layout title="Privacy Policy" showBackButton={true}>
      <ScrollView style={styles.container}>
        <View style={styles.contentContainer}>
          <Text style={styles.effectiveDate}>Effective Date: March 17, 2025</Text>

          <Text style={styles.sectionTitle}>Introduction</Text>
          <Text style={styles.paragraph}>
            Welcome to PickleGo ("we," "our," or "us"). We respect your privacy and are committed to protecting your personal information.
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile
            application PickleGo (the "App").
          </Text>
          <Text style={styles.paragraph}>
            Please read this Privacy Policy carefully. By using the App, you agree to the collection and use of information in
            accordance with this policy.
          </Text>

          <Text style={styles.sectionTitle}>Information We Collect</Text>

          <Text style={styles.subSectionTitle}>Information You Provide to Us</Text>
          <Text style={styles.paragraph}>
            • <Text style={styles.bold}>Account Information</Text>: When you create an account, we collect your name, email address, phone number, and profile picture.
          </Text>
          <Text style={styles.paragraph}>
            • <Text style={styles.bold}>User Content</Text>: Information you provide when using the App, including match details, game scores, and player statistics.
          </Text>
          <Text style={styles.paragraph}>
            • <Text style={styles.bold}>Communications</Text>: If you contact us directly, we may collect additional information you provide in your communications.
          </Text>

          <Text style={styles.subSectionTitle}>Information Automatically Collected</Text>
          <Text style={styles.paragraph}>
            • <Text style={styles.bold}>Device Information</Text>: We collect information about your mobile device, including device type, operating system, and unique device identifiers.
          </Text>
          <Text style={styles.paragraph}>
            • <Text style={styles.bold}>Usage Information</Text>: We collect information about how you use the App, including match history, preferences, and interaction with other users.
          </Text>
          <Text style={styles.paragraph}>
            • <Text style={styles.bold}>Location Information</Text>: With your permission, we may collect and process information about your location when you use location-based features.
          </Text>

          <Text style={styles.sectionTitle}>How We Use Your Information</Text>
          <Text style={styles.paragraph}>
            We use the information we collect to:
          </Text>
          <Text style={styles.paragraph}>
            • Provide, maintain, and improve the App{'\n'}
            • Create and manage your account{'\n'}
            • Track and display match history and statistics{'\n'}
            • Connect you with other players{'\n'}
            • Respond to your inquiries and provide customer support{'\n'}
            • Send you technical notices, updates, and administrative messages{'\n'}
            • Monitor and analyze usage patterns and trends
          </Text>

          <Text style={styles.sectionTitle}>Sharing Your Information</Text>
          <Text style={styles.paragraph}>
            We may share your information with:
          </Text>
          <Text style={styles.paragraph}>
            • <Text style={styles.bold}>Other Users</Text>: Your name, profile picture, and game statistics are visible to other users of the App.
          </Text>
          <Text style={styles.paragraph}>
            • <Text style={styles.bold}>Service Providers</Text>: We may share information with third-party vendors who provide services on our behalf.
          </Text>
          <Text style={styles.paragraph}>
            • <Text style={styles.bold}>Legal Requirements</Text>: We may disclose information if required by law or in response to valid requests by public authorities.
          </Text>
          <Text style={styles.paragraph}>
            • <Text style={styles.bold}>Business Transfers</Text>: If we are involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction.
          </Text>

          <Text style={styles.sectionTitle}>Data Security</Text>
          <Text style={styles.paragraph}>
            We implement appropriate technical and organizational measures to protect your personal information from unauthorized access,
            disclosure, alteration, and destruction.
          </Text>

          <Text style={styles.sectionTitle}>Your Rights</Text>
          <Text style={styles.paragraph}>
            Depending on your location, you may have rights regarding your personal information, including:
          </Text>
          <Text style={styles.paragraph}>
            • Accessing and updating your personal information{'\n'}
            • Requesting deletion of your data{'\n'}
            • Restricting processing of your data{'\n'}
            • Opting out of marketing communications
          </Text>
          <Text style={styles.paragraph}>
            To exercise these rights, please contact us using the information provided below.
          </Text>

          <Text style={styles.sectionTitle}>Children's Privacy</Text>
          <Text style={styles.paragraph}>
            The App is not intended for children under 13 years of age. We do not knowingly collect information from children under 13.
          </Text>

          <Text style={styles.sectionTitle}>Changes to This Privacy Policy</Text>
          <Text style={styles.paragraph}>
            We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on
            this page and updating the "Effective Date."
          </Text>

          <Text style={styles.sectionTitle}>Contact Us</Text>
          <Text style={styles.paragraph}>
            If you have questions or concerns about this Privacy Policy, please contact us at:
          </Text>
          <Text style={styles.contactInfo}>support@akinyemi.ca</Text>
        </View>
      </ScrollView>
    </Layout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  contentContainer: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  effectiveDate: {
    ...typography.bodySmall,
    color: colors.gray500,
    marginBottom: spacing.xl,
    fontStyle: 'italic',
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.primary,
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  subSectionTitle: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.neutral,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  paragraph: {
    ...typography.bodySmall,
    fontSize: 15,
    lineHeight: 22,
    color: colors.neutral,
    marginBottom: spacing.md,
  },
  bold: {
    fontWeight: '600',
  },
  contactInfo: {
    ...typography.bodySmall,
    fontSize: 15,
    color: colors.primary,
    marginTop: spacing.xs,
    fontWeight: '600',
  },
});

export default PrivacyPolicyScreen;

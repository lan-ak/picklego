import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Image, 
  TextInput,
  Alert,
  Modal,
  Platform,
  FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Layout from '../components/Layout';
import { useData } from '../context/DataContext';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, Player } from '../types';

type SettingItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  danger?: boolean;
};

type SettingSection = {
  title: string;
  items: SettingItem[];
};

type SettingsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const SettingsScreen: React.FC = () => {
  const { currentUser, updatePlayer, resetAllData, invitePlayer, getInvitedPlayers, players, removePlayer, insertDummyData, signOutUser } = useData();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [showInvitedPlayers, setShowInvitedPlayers] = useState(false);
  const [showManagePlayers, setShowManagePlayers] = useState(false);
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  
  const handleEditProfile = () => {
    navigation.navigate('EditProfile');
  };

  const handlePickImage = async () => {
    if (!currentUser) return;

    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please grant camera roll permissions to upload a photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      try {
        await updatePlayer(currentUser.id, {
          profilePic: result.assets[0].uri
        });
        Alert.alert('Success', 'Profile picture updated successfully');
      } catch (error) {
        Alert.alert('Error', 'Failed to update profile picture');
      }
    }
  };

  // Handle player invitation
  const handleInvitePlayer = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) {
      Alert.alert('Error', 'Please enter both name and email for the player.');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
      Alert.alert('Error', 'Please enter a valid email address.');
      return;
    }

    const invitedPlayer = await invitePlayer(inviteName.trim(), inviteEmail.trim());
    
    if (invitedPlayer) {
      Alert.alert(
        'Success', 
        `${inviteName} has been invited. They can now join the app using this email address.`,
        [{ text: 'OK', onPress: () => {
          setInviteName('');
          setInviteEmail('');
          setShowInviteModal(false);
        }}]
      );
    } else {
      Alert.alert('Error', 'This email is already registered or there was an error sending the invitation.');
    }
  };

  // Get invited players
  const invitedPlayers = getInvitedPlayers();

  // Handle player removal
  const handleRemovePlayer = (player: Player) => {
    Alert.alert(
      'Remove Player',
      `Are you sure you want to remove ${player.name} from your contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive',
          onPress: async () => {
            const success = await removePlayer(player.id);
            if (success) {
              Alert.alert('Success', `${player.name} has been removed from your contacts.`);
            } else {
              Alert.alert('Error', 'Failed to remove player. You cannot remove yourself.');
            }
          }
        }
      ]
    );
  };

  // Handle inserting dummy data
  const handleInsertDummyData = async () => {
    Alert.alert(
      'Insert Dummy Data',
      'This will add sample players and matches to help you see how the app looks with data. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Insert Data', 
          onPress: async () => {
            const success = await insertDummyData();
            if (success) {
              Alert.alert('Success', 'Dummy data has been added successfully. You are now logged in as John Smith.');
            } else {
              Alert.alert('Error', 'Failed to insert dummy data.');
            }
          }
        }
      ]
    );
  };

  const settingSections: SettingSection[] = [
    {
      title: 'Account',
      items: [
        {
          icon: 'person-circle',
          label: 'Edit Profile',
          onPress: handleEditProfile,
        },
        {
          icon: 'mail',
          label: 'Invite Players',
          onPress: () => setShowInviteModal(true),
        },
        {
          icon: 'people',
          label: 'Manage Players',
          onPress: () => setShowManagePlayers(true),
        },
        {
          icon: 'person-add',
          label: 'View Invited Players',
          onPress: () => setShowInvitedPlayers(true),
        },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { 
          icon: 'notifications-outline', 
          label: 'Notifications',
          onPress: () => Alert.alert('Coming Soon', 'Notification settings will be available in a future update.')
        },
        { 
          icon: 'color-palette-outline', 
          label: 'Appearance',
          onPress: () => Alert.alert('Coming Soon', 'Appearance settings will be available in a future update.')
        },
      ],
    },
    {
      title: 'Data',
      items: [
        {
          icon: 'cloud-download-outline',
          label: 'Export Data',
          onPress: () => Alert.alert('Coming Soon', 'Data export will be available in a future update.')
        },
        ...(__DEV__ ? [{
          icon: 'add-circle-outline' as keyof typeof Ionicons.glyphMap,
          label: 'Insert Dummy Data',
          onPress: handleInsertDummyData,
        }] : []),
        {
          icon: 'refresh-outline',
          label: 'Reset All Data',
          onPress: () => {
            Alert.alert(
              'Reset All Data',
              'Are you sure you want to reset all data? This will delete all matches, players, and settings. This action cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                { 
                  text: 'Reset', 
                  style: 'destructive',
                  onPress: async () => {
                    const success = await resetAllData();
                    if (success) {
                      Alert.alert('Success', 'All data has been reset.');
                    } else {
                      Alert.alert('Error', 'Failed to reset data.');
                    }
                  }
                }
              ]
            );
          },
          danger: true
        },
      ],
    },
    {
      title: 'About',
      items: [
        { 
          icon: 'information-circle-outline', 
          label: 'About PickleGo',
          onPress: () => Alert.alert('PickleGo', 'Version 1.0.0\n\nTrack your pickleball matches and stats.')
        },
        { 
          icon: 'document-text-outline', 
          label: 'Privacy Policy',
          onPress: () => navigation.navigate('PrivacyPolicy'),
        },
        { 
          icon: 'help-circle-outline', 
          label: 'Help & Support',
          onPress: () => Alert.alert('Help & Support', 'For help and support, please contact us at support@picklego.app')
        },
      ],
    },
    {
      title: 'Account Actions',
      items: [
        {
          icon: 'log-out-outline',
          label: 'Sign Out',
          onPress: async () => {
            Alert.alert(
              'Sign Out',
              'Are you sure you want to sign out?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Sign Out',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await signOutUser();
                      navigation.navigate('Auth');
                    } catch (error) {
                      Alert.alert('Error', 'Failed to sign out. Please try again.');
                    }
                  }
                }
              ]
            );
          },
          danger: true
        }
      ]
    }
  ];

  // Invite Player Modal
  const renderInvitePlayerModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={showInviteModal}
      onRequestClose={() => setShowInviteModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Invite Player</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowInviteModal(false)}
            >
              <Ionicons name="close" size={24} color="#0D6B3E" />
            </TouchableOpacity>
          </View>
          
          <Text style={{ fontSize: 16, color: '#666', marginBottom: 20 }}>
            Invite a player to join the app. They will receive an invitation and be able to claim their match history.
          </Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Player Name</Text>
            <TextInput
              style={styles.input}
              value={inviteName}
              onChangeText={setInviteName}
              placeholder="Enter player's name"
            />
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="Enter player's email"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          
          <TouchableOpacity 
            style={{ 
              backgroundColor: '#0D6B3E',
              borderRadius: 8,
              padding: 15,
              alignItems: 'center',
              marginTop: 10
            }}
            onPress={handleInvitePlayer}
          >
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>Send Invitation</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // Invited Players Modal
  const renderInvitedPlayersModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={showInvitedPlayers}
      onRequestClose={() => setShowInvitedPlayers(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Invited Players</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowInvitedPlayers(false)}
            >
              <Ionicons name="close" size={24} color="#0D6B3E" />
            </TouchableOpacity>
          </View>
          
          {invitedPlayers.length > 0 ? (
            <FlatList
              data={invitedPlayers}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.invitedPlayerItem}>
                  <View style={styles.invitedPlayerInfo}>
                    <Text style={styles.invitedPlayerName}>{item.name}</Text>
                    <Text style={styles.invitedPlayerEmail}>{item.email}</Text>
                  </View>
                  <View style={styles.invitedPlayerStatus}>
                    <Text style={styles.pendingText}>
                      {item.pendingClaim ? 'Pending' : 'Claimed'}
                    </Text>
                  </View>
                </View>
              )}
            />
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                You haven't invited any players yet
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );

  // Render the manage players modal
  const renderManagePlayersModal = () => {
    // Filter out the current user from the list
    const otherPlayers = players.filter(player => !currentUser || player.id !== currentUser.id);
    
    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={showManagePlayers}
        onRequestClose={() => setShowManagePlayers(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage Players</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowManagePlayers(false)}
              >
                <Ionicons name="close" size={24} color="#0D6B3E" />
              </TouchableOpacity>
            </View>
            
            {otherPlayers.length > 0 ? (
              <FlatList
                data={otherPlayers}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={styles.playerListItem}>
                    <View style={styles.playerInfo}>
                      {item.profilePic ? (
                        <Image source={{ uri: item.profilePic }} style={styles.playerAvatar} />
                      ) : (
                        <View style={styles.playerAvatarPlaceholder}>
                          <Text style={styles.playerAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <View>
                        <Text style={styles.playerName}>{item.name}</Text>
                        {item.email && <Text style={styles.playerEmail}>{item.email}</Text>}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.removePlayerButton}
                      onPress={() => handleRemovePlayer(item)}
                    >
                      <Ionicons name="trash-outline" size={20} color="#ff3b30" />
                    </TouchableOpacity>
                  </View>
                )}
                contentContainerStyle={styles.playerList}
              />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No other players in your contacts</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <Layout title="Settings">
      <ScrollView style={styles.container}>
        {/* Profile Section */}
        <View style={styles.profileSection}>
          <TouchableOpacity
            style={styles.profilePicContainer}
            onPress={handlePickImage}
            accessibilityLabel="Change profile picture"
            accessibilityRole="button"
          >
            {currentUser?.profilePic ? (
              <Image 
                source={{ uri: currentUser.profilePic }} 
                style={styles.profilePic} 
              />
            ) : (
              <View style={styles.profilePicPlaceholder}>
                <Ionicons name="person" size={40} color="#666" />
              </View>
            )}
            <View style={styles.editProfilePicButton}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </TouchableOpacity>
          
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{currentUser?.name || 'Player'}</Text>
            <View style={styles.ratingContainer}>
              <Ionicons name="star" size={18} color="#FFD700" />
              <Text style={styles.ratingText}>{currentUser?.rating?.toFixed(1) || '3.5'}</Text>
            </View>
            
            <TouchableOpacity
              style={styles.editProfileButton}
              onPress={handleEditProfile}
              accessibilityLabel="Edit profile"
              accessibilityRole="button"
            >
              <Text style={styles.editProfileButtonText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Settings Options */}
        {settingSections.map((section, index) => (
          <View key={index} style={styles.settingSection}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item, itemIndex) => (
              <TouchableOpacity
                key={itemIndex}
                style={styles.settingItem}
                onPress={item.onPress}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <View style={styles.settingItemLeft}>
                  <Ionicons
                    name={item.icon}
                    size={24}
                    color={item.danger ? '#ff3b30' : '#0D6B3E'}
                  />
                  <Text
                    style={[
                      styles.settingItemText,
                      item.danger && styles.dangerText,
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#bbb" />
              </TouchableOpacity>
            ))}
          </View>
        ))}

        {/* Render modals */}
        {renderInvitePlayerModal()}
        {renderInvitedPlayersModal()}
        {renderManagePlayersModal()}
      </ScrollView>
    </Layout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  profileSection: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  profilePicContainer: {
    position: 'relative',
  },
  profilePic: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  profilePicPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editProfilePicButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#0D6B3E',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 16,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  ratingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    marginLeft: 4,
  },
  editProfileButton: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#0D6B3E',
  },
  editProfileButtonText: {
    color: '#0D6B3E',
    fontWeight: '600',
    fontSize: 14,
  },
  settingSection: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    padding: 16,
    paddingBottom: 8,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingItemText: {
    fontSize: 16,
    marginLeft: 12,
    color: '#333',
  },
  dangerText: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 14,
    width: '85%',
    maxWidth: 360,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  closeButton: {
    padding: 5,
  },
  modalDescription: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    lineHeight: 22,
  },
  inviteButton: {
    backgroundColor: '#0D6B3E',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  inviteButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  invitedPlayersList: {
    maxHeight: 300,
  },
  invitedPlayerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  invitedPlayerInfo: {
    flex: 1,
  },
  invitedPlayerName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  invitedPlayerEmail: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  invitedPlayerStatus: {
    fontSize: 14,
    fontWeight: '500',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  pendingStatus: {
    backgroundColor: '#FFF9C4',
    color: '#F57C00',
  },
  claimedStatus: {
    backgroundColor: '#E8F5E9',
    color: '#4CAF50',
  },
  noInvitesText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    padding: 20,
  },
  playerList: {
    paddingBottom: 20,
  },
  playerListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  playerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  playerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0D6B3E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  playerAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  playerName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  playerEmail: {
    fontSize: 14,
    color: '#666',
  },
  removePlayerButton: {
    padding: 8,
  },
  emptyState: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0D6B3E',
  },
  inputContainer: {
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 7,
    fontSize: 13,
  },
  pendingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F57C00',
  },
  saveButton: {
    backgroundColor: '#0D6B3E',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 14,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default SettingsScreen; 
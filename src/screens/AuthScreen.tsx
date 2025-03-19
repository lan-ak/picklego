import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/DataContext';

type AuthScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const AuthScreen = () => {
  const navigation = useNavigation<AuthScreenNavigationProp>();
  const { addPlayer, isEmailAvailable, isUsernameAvailable, setCurrentUser, insertDummyData } = useData();
  
  const [isLogin, setIsLogin] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const handleToggleMode = () => {
    setIsLogin(!isLogin);
    // Clear form fields when switching modes
    setName('');
    setUsername('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  };
  
  const handleSignUp = async () => {
    // Validate fields
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    
    if (!username.trim()) {
      Alert.alert('Error', 'Please enter a username');
      return;
    }
    
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    
    if (!password) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }
    
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    
    // Check if email is available
    const emailAvailable = await isEmailAvailable(email);
    if (!emailAvailable) {
      Alert.alert('Error', 'This email is already registered');
      return;
    }
    
    // Check if username is available
    const usernameAvailable = await isUsernameAvailable(username);
    if (!usernameAvailable) {
      Alert.alert('Error', 'This username is already taken');
      return;
    }
    
    try {
      // Create new player
      await addPlayer({
        name: name.trim(),
        username: username.trim(),
        email: email.trim(),
        password: password, // In a real app, this should be hashed
      });
      
      // Navigate to main app
      navigation.navigate('MainTabs', { screen: 'Home' });
    } catch (error) {
      Alert.alert('Error', 'Failed to create account');
    }
  };
  
  const handleLogin = async () => {
    // In a real app, you would validate credentials against a backend
    // For this demo, we'll just check if the email and password match any player
    
    if (!email.trim() || !password) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }
    
    try {
      // Simulate login by finding a player with matching email
      // In a real app, this would be a server request
      const { players } = useData();
      const matchingPlayer = players.find(
        player => player.email === email.trim() && player.password === password
      );
      
      if (matchingPlayer) {
        // Set as current user
        setCurrentUser(matchingPlayer);
        
        // Navigate to main app
        navigation.navigate('MainTabs', { screen: 'Home' });
      } else {
        Alert.alert('Error', 'Invalid email or password');
      }
    } catch (error) {
      Alert.alert('Error', 'Login failed');
    }
  };
  
  // Handle inserting dummy data for quick testing
  const handleInsertDummyData = async () => {
    const success = await insertDummyData();
    if (success) {
      navigation.navigate('MainTabs' as never);
    } else {
      Alert.alert('Error', 'Failed to insert dummy data.');
    }
  };
  
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.logoContainer}>
          <Ionicons name="tennisball-outline" size={80} color="#0D6B3E" />
          <Text style={styles.appName}>PickleGo</Text>
          <Text style={styles.tagline}>Track your pickleball matches and stats</Text>
        </View>
        
        <View style={styles.formContainer}>
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabButton, isLogin ? styles.inactiveTab : styles.activeTab]}
              onPress={() => setIsLogin(false)}
            >
              <Text style={[styles.tabText, isLogin ? styles.inactiveTabText : styles.activeTabText]}>
                Sign Up
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.tabButton, isLogin ? styles.activeTab : styles.inactiveTab]}
              onPress={() => setIsLogin(true)}
            >
              <Text style={[styles.tabText, isLogin ? styles.activeTabText : styles.inactiveTabText]}>
                Login
              </Text>
            </TouchableOpacity>
          </View>
          
          {!isLogin && (
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your full name"
                />
              </View>
              
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Username</Text>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Choose a username"
                  autoCapitalize="none"
                />
              </View>
            </>
          )}
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Your email address"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Choose a password"
              secureTextEntry
            />
          </View>
          
          {!isLogin && (
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm your password"
                secureTextEntry
              />
            </View>
          )}
          
          <TouchableOpacity
            style={styles.submitButton}
            onPress={isLogin ? handleLogin : handleSignUp}
          >
            <Text style={styles.submitButtonText}>
              {isLogin ? 'Login' : 'Create Account'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={handleToggleMode}
          >
            <Text style={styles.toggleButtonText}>
              {isLogin ? 'Need an account? Sign up' : 'Already have an account? Login'}
            </Text>
          </TouchableOpacity>
          
          {/* Add a button for quick testing with dummy data */}
          <TouchableOpacity 
            style={styles.dummyDataButton} 
            onPress={handleInsertDummyData}
          >
            <Text style={styles.dummyDataButtonText}>Quick Start with Demo Data</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  appName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0D6B3E',
    marginTop: 16,
  },
  tagline: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
  formContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#0D6B3E',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#0D6B3E',
  },
  inactiveTab: {
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  inactiveTabText: {
    color: '#0D6B3E',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: '#0D6B3E',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  toggleButton: {
    alignItems: 'center',
    marginTop: 16,
    padding: 8,
  },
  toggleButtonText: {
    color: '#0D6B3E',
    fontSize: 14,
  },
  dummyDataButton: {
    marginTop: 20,
    backgroundColor: '#E8F5E9',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0D6B3E',
  },
  dummyDataButtonText: {
    color: '#0D6B3E',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AuthScreen; 
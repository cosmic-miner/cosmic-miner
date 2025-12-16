import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
  Dimensions,
  Share,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const { width, height } = Dimensions.get('window');
const GAME_HEIGHT = height - 300;
const SHIP_SIZE = 50;
const CRYSTAL_SIZE = 30;

// API URL - Production'da değiştir
const API_URL = "https://6d0699a9-cb44-4212-8039-3822d47fb0c1.preview.emergentagent.com";
const TRC20_ADDRESS = "TP92d2cyjwXNdFuJN9P8WeQ2jDWW7rvJMA";

export default function App() {
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  
  // Auth form state
  const [authScreen, setAuthScreen] = useState('login'); // login, register
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [referralCode, setReferralCode] = useState('');
  
  // App state
  const [screen, setScreen] = useState('menu'); // menu, game, shop, wallet, referral
  const [coins, setCoins] = useState(100);
  const [shipX, setShipX] = useState(width / 2);
  const [score, setScore] = useState(0);
  const [crystals, setCrystals] = useState([]);
  const [gameRunning, setGameRunning] = useState(false);
  const [highScore, setHighScore] = useState(0);
  
  // Referral state
  const [referralInfo, setReferralInfo] = useState(null);
  const [invitedUsers, setInvitedUsers] = useState([]);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const savedToken = await AsyncStorage.getItem('token');
      if (savedToken) {
        setToken(savedToken);
        await fetchUser(savedToken);
      }
    } catch (e) {
      console.log('Auth check error:', e);
    }
  };

  const fetchUser = async (authToken) => {
    try {
      const response = await axios.get(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      setUser(response.data);
      setCoins(response.data.coins);
      setIsLoggedIn(true);
    } catch (e) {
      console.log('Fetch user error:', e);
      await AsyncStorage.removeItem('token');
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Hata', 'Email ve şifre gerekli');
      return;
    }
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, { email, password });
      const { access_token, user: userData } = response.data;
      await AsyncStorage.setItem('token', access_token);
      setToken(access_token);
      setUser(userData);
      setCoins(userData.coins);
      setIsLoggedIn(true);
    } catch (e) {
      Alert.alert('Hata', e.response?.data?.detail || 'Giriş başarısız');
    }
  };

  const handleRegister = async () => {
    if (!email || !password || !username) {
      Alert.alert('Hata', 'Tüm alanlar gerekli');
      return;
    }
    try {
      const response = await axios.post(`${API_URL}/api/auth/register`, { 
        email, 
        password, 
        username,
        referral_code: referralCode || null
      });
      const { access_token, user: userData } = response.data;
      await AsyncStorage.setItem('token', access_token);
      setToken(access_token);
      setUser(userData);
      setCoins(userData.coins);
      setIsLoggedIn(true);
      
      const bonusMsg = referralCode 
        ? `🎁 ${userData.coins} coin hoşgeldin bonusu! (Davet bonusu dahil)` 
        : `🎁 ${userData.coins} coin hoşgeldin bonusu!`;
      Alert.alert('Hoş Geldin!', bonusMsg);
    } catch (e) {
      Alert.alert('Hata', e.response?.data?.detail || 'Kayıt başarısız');
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setIsLoggedIn(false);
    setScreen('menu');
  };

  const fetchReferralInfo = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/referral/info`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setReferralInfo(response.data);
      
      const usersResponse = await axios.get(`${API_URL}/api/referral/invited-users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInvitedUsers(usersResponse.data.invited_users);
    } catch (e) {
      console.log('Referral fetch error:', e);
    }
  };

  const shareReferralCode = async () => {
    try {
      await Share.share({
        message: `🚀 Cosmic Miner'da beni davet kodum ile katıl ve ekstra coin kazan!\n\nDavet Kodum: ${user?.referral_code || referralInfo?.referral_code}\n\nOyunu indir ve kazan!`,
      });
    } catch (e) {
      Alert.alert('Davet Kodu', user?.referral_code || referralInfo?.referral_code);
    }
  };

  // Game Logic
  useEffect(() => {
    if (!gameRunning) return;
    
    const spawnInterval = setInterval(() => {
      const newCrystal = {
        id: Date.now(),
        x: Math.random() * (width - CRYSTAL_SIZE),
        y: 0,
      };
      setCrystals(prev => [...prev, newCrystal]);
    }, 800);

    const moveInterval = setInterval(() => {
      setCrystals(prev => {
        return prev.map(c => ({ ...c, y: c.y + 5 })).filter(c => {
          if (
            c.y > GAME_HEIGHT - 80 &&
            c.y < GAME_HEIGHT - 30 &&
            Math.abs(c.x - shipX) < SHIP_SIZE
          ) {
            setScore(s => s + 10);
            return false;
          }
          if (c.y > GAME_HEIGHT) return false;
          return true;
        });
      });
    }, 50);

    return () => {
      clearInterval(spawnInterval);
      clearInterval(moveInterval);
    };
  }, [gameRunning, shipX]);

  const startGame = () => {
    setScore(0);
    setCrystals([]);
    setShipX(width / 2);
    setGameRunning(true);
  };

  const endGame = async () => {
    setGameRunning(false);
    
    if (token) {
      try {
        const response = await axios.post(`${API_URL}/api/game/result`, {
          coins_earned: score,
          distance: 0,
          crystals_collected: Math.floor(score / 10)
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setCoins(response.data.total_coins);
        Alert.alert(
          '🎮 Oyun Bitti!',
          `Skor: ${score}\nKazanılan Coin: ${response.data.coins_earned}\nToplam Coin: ${response.data.total_coins}`
        );
        
        await fetchUser(token);
      } catch (e) {
        console.log('Score submit error:', e);
      }
    } else {
      const newCoins = coins + score;
      const newHighScore = Math.max(highScore, score);
      setCoins(newCoins);
      setHighScore(newHighScore);
      Alert.alert('🎮 Oyun Bitti!', `Skor: ${score}\nToplam Coin: ${newCoins}`);
    }
  };

  const moveLeft = () => setShipX(x => Math.max(0, x - 40));
  const moveRight = () => setShipX(x => Math.min(width - SHIP_SIZE, x + 40));

  // AUTH SCREENS
  if (!isLoggedIn) {
    if (authScreen === 'login') {
      return (
        <View style={styles.container}>
          <StatusBar style="light" />
          <Text style={styles.title}>🚀 COSMIC MINER</Text>
          <Text style={styles.subtitle}>Giriş Yap</Text>
          
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#666"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Şifre"
            placeholderTextColor="#666"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          
          <TouchableOpacity style={styles.playBtn} onPress={handleLogin}>
            <Text style={styles.playBtnText}>GİRİŞ YAP</Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => setAuthScreen('register')}>
            <Text style={styles.linkText}>Hesabın yok mu? <Text style={styles.linkHighlight}>Kayıt Ol</Text></Text>
          </TouchableOpacity>
        </View>
      );
    }

    // REGISTER SCREEN
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <StatusBar style="light" />
        <Text style={styles.title}>🚀 COSMIC MINER</Text>
        <Text style={styles.subtitle}>Yeni Hesap Oluştur</Text>
        <Text style={styles.bonusText}>🎁 100 Coin Hoşgeldin Bonusu!</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Kullanıcı Adı"
          placeholderTextColor="#666"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#666"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Şifre"
          placeholderTextColor="#666"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TextInput
          style={[styles.input, styles.referralInput]}
          placeholder="Davet Kodu (Opsiyonel) - +50 Bonus!"
          placeholderTextColor="#888"
          value={referralCode}
          onChangeText={setReferralCode}
          autoCapitalize="characters"
        />
        
        <TouchableOpacity style={styles.playBtn} onPress={handleRegister}>
          <Text style={styles.playBtnText}>KAYIT OL</Text>
        </TouchableOpacity>
        
        <TouchableOpacity onPress={() => setAuthScreen('login')}>
          <Text style={styles.linkText}>Zaten hesabın var mı? <Text style={styles.linkHighlight}>Giriş Yap</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // MENU SCREEN
  if (screen === 'menu') {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <Text style={styles.title}>🚀 COSMIC MINER</Text>
        <Text style={styles.welcomeText}>Hoş geldin, {user?.username}!</Text>
        
        <View style={styles.coinBox}>
          <Text style={styles.coinText}>💰 {coins} Coin</Text>
        </View>
        
        <TouchableOpacity style={styles.playBtn} onPress={() => setScreen('game')}>
          <Text style={styles.playBtnText}>🎮 OYNA</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.menuBtn} onPress={() => setScreen('shop')}>
          <Text style={styles.menuBtnText}>🛒 Mağaza</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.menuBtn} onPress={() => setScreen('wallet')}>
          <Text style={styles.menuBtnText}>💳 Cüzdan</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.menuBtn, styles.referralBtn]} onPress={() => { fetchReferralInfo(); setScreen('referral'); }}>
          <Text style={styles.menuBtnText}>👥 Arkadaş Davet Et (+200 Coin!)</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Çıkış Yap</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // REFERRAL SCREEN
  if (screen === 'referral') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <StatusBar style="light" />
        
        <TouchableOpacity onPress={() => setScreen('menu')}>
          <Text style={styles.backBtn}>← Geri</Text>
        </TouchableOpacity>
        
        <Text style={styles.pageTitle}>👥 Arkadaş Davet Et</Text>
        
        <View style={styles.referralCard}>
          <Text style={styles.referralLabel}>Senin Davet Kodun:</Text>
          <Text style={styles.referralCodeBig}>{user?.referral_code || referralInfo?.referral_code}</Text>
          
          <TouchableOpacity style={styles.shareBtn} onPress={shareReferralCode}>
            <Text style={styles.shareBtnText}>📤 Paylaş</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.bonusCard}>
          <Text style={styles.bonusTitle}>🎁 Bonus Detayları</Text>
          <Text style={styles.bonusItem}>✅ Sen davet ettiğinde: +200 Coin</Text>
          <Text style={styles.bonusItem}>✅ Arkadaşın katıldığında: +50 Coin (arkadaşa)</Text>
        </View>
        
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>📊 İstatistikler</Text>
          <Text style={styles.statsItem}>Davet Edilen: {referralInfo?.referral_count || 0} kişi</Text>
          <Text style={styles.statsItem}>Kazanılan: {referralInfo?.total_earned_from_referrals || 0} Coin</Text>
        </View>
        
        {invitedUsers.length > 0 && (
          <View style={styles.invitedCard}>
            <Text style={styles.invitedTitle}>👥 Davet Ettiklerin</Text>
            {invitedUsers.map((u, i) => (
              <Text key={i} style={styles.invitedItem}>• {u.username}</Text>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  // GAME SCREEN
  if (screen === 'game') {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        
        <View style={styles.gameHeader}>
          <TouchableOpacity onPress={() => { setGameRunning(false); setScreen('menu'); }}>
            <Text style={styles.backBtn}>← Geri</Text>
          </TouchableOpacity>
          <Text style={styles.scoreText}>💎 {score}</Text>
        </View>
        
        <View style={styles.gameArea}>
          {crystals.map(c => (
            <Text key={c.id} style={[styles.crystal, { left: c.x, top: c.y }]}>💎</Text>
          ))}
          <Text style={[styles.ship, { left: shipX, bottom: 30 }]}>🛸</Text>
        </View>
        
        {!gameRunning ? (
          <TouchableOpacity style={styles.startBtn} onPress={startGame}>
            <Text style={styles.startBtnText}>▶️ BAŞLA</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.controls}>
            <TouchableOpacity style={styles.controlBtn} onPress={moveLeft}>
              <Text style={styles.controlText}>⬅️</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stopBtn} onPress={endGame}>
              <Text style={styles.controlText}>⏹️</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlBtn} onPress={moveRight}>
              <Text style={styles.controlText}>➡️</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // SHOP SCREEN
  if (screen === 'shop') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <StatusBar style="light" />
        
        <TouchableOpacity onPress={() => setScreen('menu')}>
          <Text style={styles.backBtn}>← Geri</Text>
        </TouchableOpacity>
        
        <Text style={styles.pageTitle}>🛒 Mağaza</Text>
        <Text style={styles.coinText}>💰 {coins} Coin</Text>
        
        <View style={styles.shopItem}>
          <Text style={styles.shopEmoji}>🚀</Text>
          <Text style={styles.shopName}>Hızlı Gemi</Text>
          <Text style={styles.shopPrice}>5 USDT</Text>
        </View>
        
        <View style={styles.shopItem}>
          <Text style={styles.shopEmoji}>⚡</Text>
          <Text style={styles.shopName}>2x Boost</Text>
          <Text style={styles.shopPrice}>3 USDT</Text>
        </View>
        
        <View style={styles.shopItem}>
          <Text style={styles.shopEmoji}>💰</Text>
          <Text style={styles.shopName}>1000 Coin</Text>
          <Text style={styles.shopPrice}>2 USDT</Text>
        </View>
        
        <Text style={styles.paymentTitle}>💳 Ödeme Adresi (TRC20 USDT):</Text>
        <Text style={styles.address}>{TRC20_ADDRESS}</Text>
        <Text style={styles.paymentNote}>Ödeme yaptıktan sonra admin ile iletişime geçin.</Text>
      </ScrollView>
    );
  }

  // WALLET SCREEN
  if (screen === 'wallet') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <StatusBar style="light" />
        
        <TouchableOpacity onPress={() => setScreen('menu')}>
          <Text style={styles.backBtn}>← Geri</Text>
        </TouchableOpacity>
        
        <Text style={styles.pageTitle}>💳 Cüzdan</Text>
        
        <View style={styles.walletBox}>
          <Text style={styles.walletLabel}>Bakiye</Text>
          <Text style={styles.walletAmount}>{coins}</Text>
          <Text style={styles.walletCoin}>COIN</Text>
        </View>
        
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>💸 Para Çekme</Text>
          <Text style={styles.infoText}>Minimum: 10,000 Coin</Text>
          <Text style={styles.infoText}>Kur: 1000 Coin = 1 USDT</Text>
          <Text style={styles.infoText}>Şu an: {coins} Coin = {(coins/1000).toFixed(2)} USDT</Text>
        </View>
        
        {coins >= 10000 ? (
          <TouchableOpacity 
            style={styles.withdrawBtn}
            onPress={() => Alert.alert('Para Çekme', 'Admin ile iletişime geçin.\n\nTRC20 Adres: ' + TRC20_ADDRESS)}
          >
            <Text style={styles.withdrawBtnText}>Para Çek</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.lockedText}>🔒 Para çekmek için {10000 - coins} coin daha kazan!</Text>
        )}
        
        <View style={styles.tipBox}>
          <Text style={styles.tipTitle}>💡 İpucu</Text>
          <Text style={styles.tipText}>Arkadaşlarını davet ederek hızlıca coin kazanabilirsin! Her davet = 200 coin!</Text>
        </View>
      </ScrollView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#00d4ff',
    textAlign: 'center',
    marginTop: 80,
  },
  subtitle: {
    fontSize: 18,
    color: '#888',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  welcomeText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginTop: 5,
  },
  bonusText: {
    fontSize: 14,
    color: '#ffd700',
    textAlign: 'center',
    marginBottom: 20,
    backgroundColor: 'rgba(255,215,0,0.1)',
    padding: 10,
    borderRadius: 10,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 15,
    marginHorizontal: 30,
    marginBottom: 15,
    color: '#fff',
    fontSize: 16,
  },
  referralInput: {
    borderColor: '#ffd700',
    borderWidth: 1,
  },
  coinBox: {
    backgroundColor: 'rgba(255,215,0,0.2)',
    padding: 15,
    borderRadius: 20,
    marginTop: 30,
    alignSelf: 'center',
  },
  coinText: {
    fontSize: 24,
    color: '#ffd700',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  playBtn: {
    backgroundColor: '#00d4ff',
    padding: 18,
    borderRadius: 30,
    marginTop: 30,
    marginHorizontal: 50,
  },
  playBtnText: {
    fontSize: 20,
    color: '#000',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  menuBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 15,
    borderRadius: 15,
    marginTop: 15,
    marginHorizontal: 50,
  },
  menuBtnText: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
  referralBtn: {
    backgroundColor: 'rgba(255,215,0,0.2)',
    borderWidth: 1,
    borderColor: '#ffd700',
  },
  linkText: {
    color: '#888',
    textAlign: 'center',
    marginTop: 25,
  },
  linkHighlight: {
    color: '#00d4ff',
    fontWeight: 'bold',
  },
  logoutBtn: {
    marginTop: 30,
    padding: 10,
  },
  logoutText: {
    color: '#ff6b6b',
    textAlign: 'center',
  },
  backBtn: {
    color: '#00d4ff',
    fontSize: 18,
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  // Referral styles
  referralCard: {
    backgroundColor: 'rgba(0,212,255,0.1)',
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    marginBottom: 20,
  },
  referralLabel: {
    color: '#888',
    fontSize: 14,
  },
  referralCodeBig: {
    color: '#00d4ff',
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 3,
    marginVertical: 15,
  },
  shareBtn: {
    backgroundColor: '#00d4ff',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
  },
  shareBtnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
  bonusCard: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
  },
  bonusTitle: {
    color: '#ffd700',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  bonusItem: {
    color: '#fff',
    marginTop: 5,
  },
  statsCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
  },
  statsTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  statsItem: {
    color: '#888',
    marginTop: 5,
  },
  invitedCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 15,
    padding: 20,
  },
  invitedTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  invitedItem: {
    color: '#888',
    marginTop: 5,
  },
  // Game styles
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 50,
  },
  scoreText: {
    color: '#ffd700',
    fontSize: 24,
    fontWeight: 'bold',
  },
  gameArea: {
    height: GAME_HEIGHT,
    backgroundColor: 'rgba(0,0,50,0.3)',
    position: 'relative',
  },
  crystal: {
    position: 'absolute',
    fontSize: CRYSTAL_SIZE,
  },
  ship: {
    position: 'absolute',
    fontSize: SHIP_SIZE,
  },
  startBtn: {
    backgroundColor: '#00ff88',
    padding: 20,
    borderRadius: 30,
    margin: 20,
  },
  startBtnText: {
    fontSize: 24,
    color: '#000',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
  },
  controlBtn: {
    backgroundColor: 'rgba(0,212,255,0.3)',
    padding: 20,
    borderRadius: 50,
    width: 80,
    alignItems: 'center',
  },
  stopBtn: {
    backgroundColor: 'rgba(255,100,100,0.3)',
    padding: 20,
    borderRadius: 50,
    width: 80,
    alignItems: 'center',
  },
  controlText: {
    fontSize: 30,
  },
  // Shop styles
  shopItem: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 20,
    borderRadius: 15,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  shopEmoji: {
    fontSize: 40,
    marginRight: 15,
  },
  shopName: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
  },
  shopPrice: {
    color: '#00d4ff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  paymentTitle: {
    color: '#888',
    marginTop: 30,
  },
  address: {
    color: '#00d4ff',
    fontSize: 12,
    marginTop: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 15,
    borderRadius: 10,
  },
  paymentNote: {
    color: '#ff6b6b',
    fontSize: 12,
    marginTop: 10,
  },
  // Wallet styles
  walletBox: {
    backgroundColor: 'rgba(0,212,255,0.1)',
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  walletLabel: {
    color: '#888',
    fontSize: 14,
  },
  walletAmount: {
    color: '#ffd700',
    fontSize: 48,
    fontWeight: 'bold',
  },
  walletCoin: {
    color: '#888',
    fontSize: 16,
  },
  infoBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 20,
    borderRadius: 15,
    marginBottom: 20,
  },
  infoTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  infoText: {
    color: '#888',
    marginTop: 5,
  },
  withdrawBtn: {
    backgroundColor: '#00ff88',
    padding: 18,
    borderRadius: 25,
  },
  withdrawBtnText: {
    color: '#000',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 18,
  },
  lockedText: {
    color: '#888',
    textAlign: 'center',
  },
  tipBox: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    padding: 15,
    borderRadius: 15,
    marginTop: 20,
  },
  tipTitle: {
    color: '#ffd700',
    fontWeight: 'bold',
    marginBottom: 5,
  },
  tipText: {
    color: '#888',
    fontSize: 13,
  },
});

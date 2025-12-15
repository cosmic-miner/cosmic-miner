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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');
const GAME_HEIGHT = height - 300;
const SHIP_SIZE = 50;
const CRYSTAL_SIZE = 30;

// TRC20 Adres
const TRC20_ADDRESS = "TP92d2cyjwXNdFuJN9P8WeQ2jDWW7rvJMA";

export default function App() {
  const [screen, setScreen] = useState('menu'); // menu, game, shop, wallet
  const [coins, setCoins] = useState(100);
  const [shipX, setShipX] = useState(width / 2);
  const [score, setScore] = useState(0);
  const [crystals, setCrystals] = useState([]);
  const [gameRunning, setGameRunning] = useState(false);
  const [highScore, setHighScore] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const savedCoins = await AsyncStorage.getItem('coins');
      const savedHighScore = await AsyncStorage.getItem('highScore');
      if (savedCoins) setCoins(parseInt(savedCoins));
      if (savedHighScore) setHighScore(parseInt(savedHighScore));
    } catch (e) {}
  };

  const saveData = async (newCoins, newHighScore) => {
    try {
      await AsyncStorage.setItem('coins', newCoins.toString());
      await AsyncStorage.setItem('highScore', newHighScore.toString());
    } catch (e) {}
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
          // Check collision
          if (
            c.y > GAME_HEIGHT - 80 &&
            c.y < GAME_HEIGHT - 30 &&
            Math.abs(c.x - shipX) < SHIP_SIZE
          ) {
            setScore(s => s + 10);
            return false;
          }
          // Remove if off screen
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

  const endGame = () => {
    setGameRunning(false);
    const newCoins = coins + score;
    const newHighScore = Math.max(highScore, score);
    setCoins(newCoins);
    setHighScore(newHighScore);
    saveData(newCoins, newHighScore);
    Alert.alert(
      '🎮 Oyun Bitti!',
      `Skor: ${score}\nKazanılan Coin: ${score}\nToplam Coin: ${newCoins}`
    );
  };

  const moveLeft = () => setShipX(x => Math.max(0, x - 40));
  const moveRight = () => setShipX(x => Math.min(width - SHIP_SIZE, x + 40));

  // MENU SCREEN
  if (screen === 'menu') {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <Text style={styles.title}>🚀 COSMIC MINER</Text>
        <Text style={styles.subtitle}>Uzayın Derinliklerinde Kazan!</Text>
        
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
        
        <Text style={styles.highScore}>🏆 En Yüksek: {highScore}</Text>
      </View>
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
            <Text
              key={c.id}
              style={[styles.crystal, { left: c.x, top: c.y }]}
            >
              💎
            </Text>
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
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#00d4ff',
    textAlign: 'center',
    marginTop: 80,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginTop: 10,
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
    padding: 20,
    borderRadius: 30,
    marginTop: 40,
    marginHorizontal: 50,
  },
  playBtnText: {
    fontSize: 24,
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
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
  },
  highScore: {
    color: '#888',
    textAlign: 'center',
    marginTop: 30,
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 50,
  },
  backBtn: {
    color: '#00d4ff',
    fontSize: 18,
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
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 20,
    marginBottom: 20,
  },
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
  walletBox: {
    backgroundColor: 'rgba(0,212,255,0.1)',
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 30,
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
    marginTop: 20,
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
    marginTop: 20,
  },
});

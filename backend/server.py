from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'cosmic_miner')]

# JWT Settings
SECRET_KEY = os.environ.get('SECRET_KEY', 'cosmic-miner-secret-key-2024')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# TRC20 Payment Address
TRC20_ADDRESS = "TP92d2cyjwXNdFuJN9P8WeQ2jDWW7rvJMA"

# Game Settings
WELCOME_BONUS = 100  # Hoşgeldin bonusu
WITHDRAW_THRESHOLD = 10000  # Para çekme eşiği
USDT_PER_COIN = 0.001  # 1000 coin = 1 USDT
REFERRAL_BONUS_INVITER = 200  # Davet edene verilen bonus
REFERRAL_BONUS_INVITED = 50  # Davet edilene ekstra bonus

app = FastAPI(title="Cosmic Miner API")
api_router = APIRouter(prefix="/api")

# ============ MODELS ============

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    username: str
    referral_code: Optional[str] = None  # Davet kodu (opsiyonel)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    username: str
    password_hash: str
    coins: int = WELCOME_BONUS  # Hoşgeldin bonusu
    total_earned: int = 0
    ship_level: int = 1
    owned_ships: List[str] = ["basic"]
    active_ship: str = "basic"
    active_boosts: List[dict] = []
    is_admin: bool = False
    referral_code: str = Field(default_factory=lambda: str(uuid.uuid4())[:8].upper())
    referred_by: Optional[str] = None
    referral_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class GameResult(BaseModel):
    coins_earned: int
    distance: int
    crystals_collected: int

class ShopItem(BaseModel):
    id: str
    name: str
    description: str
    type: str  # ship, boost, upgrade
    price_coins: Optional[int] = None
    price_usdt: Optional[float] = None
    coin_multiplier: float = 1.0
    speed_bonus: float = 0
    image: str = ""
    rarity: str = "common"  # common, rare, epic, legendary

class PaymentRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    username: str
    tx_hash: str
    amount_usdt: float
    item_id: str
    item_name: str
    status: str = "pending"  # pending, approved, rejected
    created_at: datetime = Field(default_factory=datetime.utcnow)
    processed_at: Optional[datetime] = None

class PaymentSubmit(BaseModel):
    tx_hash: str
    amount_usdt: float
    item_id: str

class WithdrawRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    username: str
    coins_amount: int
    usdt_amount: float
    wallet_address: str
    status: str = "pending"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    processed_at: Optional[datetime] = None

class WithdrawSubmit(BaseModel):
    coins_amount: int
    wallet_address: str

# ============ SHOP ITEMS ============

SHOP_ITEMS = [
    # Coin ile alınabilir gemiler
    ShopItem(id="ship_silver", name="Silver Cruiser", description="%50 daha fazla coin topla", type="ship", price_coins=500, coin_multiplier=1.5, rarity="common", image="🚀"),
    ShopItem(id="ship_gold", name="Gold Voyager", description="2x coin topla", type="ship", price_coins=2000, coin_multiplier=2.0, rarity="rare", image="✨"),
    
    # USDT ile alınabilir premium gemiler
    ShopItem(id="ship_diamond", name="Diamond Striker", description="3x coin + Hız bonusu", type="ship", price_usdt=5.0, coin_multiplier=3.0, speed_bonus=0.2, rarity="epic", image="💎"),
    ShopItem(id="ship_cosmic", name="Cosmic Destroyer", description="5x coin + Max hız", type="ship", price_usdt=15.0, coin_multiplier=5.0, speed_bonus=0.5, rarity="legendary", image="🌟"),
    ShopItem(id="ship_phoenix", name="Phoenix Inferno", description="10x coin + Kalkan", type="ship", price_usdt=50.0, coin_multiplier=10.0, speed_bonus=0.3, rarity="legendary", image="🔥"),
    
    # Boostlar - USDT
    ShopItem(id="boost_2x_1h", name="2x Boost (1 Saat)", description="1 saat boyunca 2x coin", type="boost", price_usdt=1.0, coin_multiplier=2.0, rarity="rare", image="⚡"),
    ShopItem(id="boost_5x_1h", name="5x Boost (1 Saat)", description="1 saat boyunca 5x coin", type="boost", price_usdt=3.0, coin_multiplier=5.0, rarity="epic", image="💫"),
    ShopItem(id="boost_10x_30m", name="10x Mega Boost (30dk)", description="30 dakika 10x coin", type="boost", price_usdt=5.0, coin_multiplier=10.0, rarity="legendary", image="🌈"),
    
    # Coin paketi - USDT
    ShopItem(id="coins_1000", name="1000 Coin Paketi", description="1000 oyun coini", type="coins", price_usdt=2.0, rarity="common", image="💰"),
    ShopItem(id="coins_5000", name="5000 Coin Paketi", description="5000 oyun coini + %10 bonus", type="coins", price_usdt=8.0, rarity="rare", image="💰"),
    ShopItem(id="coins_15000", name="15000 Coin Paketi", description="15000 oyun coini + %25 bonus", type="coins", price_usdt=20.0, rarity="epic", image="💰"),
]

SHIP_DATA = {
    "basic": {"name": "Basic Shuttle", "multiplier": 1.0, "speed": 0, "image": "🛸"},
    "ship_silver": {"name": "Silver Cruiser", "multiplier": 1.5, "speed": 0, "image": "🚀"},
    "ship_gold": {"name": "Gold Voyager", "multiplier": 2.0, "speed": 0.1, "image": "✨"},
    "ship_diamond": {"name": "Diamond Striker", "multiplier": 3.0, "speed": 0.2, "image": "💎"},
    "ship_cosmic": {"name": "Cosmic Destroyer", "multiplier": 5.0, "speed": 0.5, "image": "🌟"},
    "ship_phoenix": {"name": "Phoenix Inferno", "multiplier": 10.0, "speed": 0.3, "image": "🔥"},
}

# ============ AUTH HELPERS ============

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await db.users.find_one({"id": user_id})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ============ AUTH ENDPOINTS ============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if email exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email zaten kayıtlı")
    
    # Check username
    existing_username = await db.users.find_one({"username": user_data.username})
    if existing_username:
        raise HTTPException(status_code=400, detail="Kullanıcı adı zaten alınmış")
    
    # Referral bonus hesapla
    bonus_coins = WELCOME_BONUS
    referred_by_user = None
    
    # Davet kodu varsa kontrol et
    if user_data.referral_code:
        referred_by_user = await db.users.find_one({"referral_code": user_data.referral_code.upper()})
        if referred_by_user:
            bonus_coins += REFERRAL_BONUS_INVITED  # Davet edilene ekstra bonus
    
    # Create user with welcome bonus
    user = User(
        email=user_data.email,
        username=user_data.username,
        password_hash=hash_password(user_data.password),
        coins=bonus_coins,
        total_earned=bonus_coins,
        referred_by=referred_by_user["id"] if referred_by_user else None
    )
    
    await db.users.insert_one(user.dict())
    
    # Davet edene bonus ver
    if referred_by_user:
        await db.users.update_one(
            {"id": referred_by_user["id"]},
            {
                "$inc": {"coins": REFERRAL_BONUS_INVITER, "total_earned": REFERRAL_BONUS_INVITER, "referral_count": 1}
            }
        )
    
    token = create_access_token({"user_id": user.id})
    
    user_response = {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "coins": user.coins,
        "total_earned": user.total_earned,
        "ship_level": user.ship_level,
        "owned_ships": user.owned_ships,
        "active_ship": user.active_ship,
        "is_admin": user.is_admin
    }
    
    return TokenResponse(access_token=token, user=user_response)

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(user_data: UserLogin):
    user = await db.users.find_one({"email": user_data.email})
    if not user:
        raise HTTPException(status_code=401, detail="Email veya şifre hatalı")
    
    if not verify_password(user_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email veya şifre hatalı")
    
    token = create_access_token({"user_id": user["id"]})
    
    user_response = {
        "id": user["id"],
        "email": user["email"],
        "username": user["username"],
        "coins": user["coins"],
        "total_earned": user["total_earned"],
        "ship_level": user.get("ship_level", 1),
        "owned_ships": user.get("owned_ships", ["basic"]),
        "active_ship": user.get("active_ship", "basic"),
        "is_admin": user.get("is_admin", False)
    }
    
    return TokenResponse(access_token=token, user=user_response)

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "username": current_user["username"],
        "coins": current_user["coins"],
        "total_earned": current_user["total_earned"],
        "ship_level": current_user.get("ship_level", 1),
        "owned_ships": current_user.get("owned_ships", ["basic"]),
        "active_ship": current_user.get("active_ship", "basic"),
        "active_boosts": current_user.get("active_boosts", []),
        "is_admin": current_user.get("is_admin", False),
        "referral_code": current_user.get("referral_code", ""),
        "referral_count": current_user.get("referral_count", 0)
    }

# ============ REFERRAL ENDPOINTS ============

@api_router.get("/referral/info")
async def get_referral_info(current_user: dict = Depends(get_current_user)):
    """Kullanıcının davet bilgilerini getir"""
    return {
        "referral_code": current_user.get("referral_code", ""),
        "referral_count": current_user.get("referral_count", 0),
        "bonus_per_invite": REFERRAL_BONUS_INVITER,
        "bonus_for_invited": REFERRAL_BONUS_INVITED,
        "total_earned_from_referrals": current_user.get("referral_count", 0) * REFERRAL_BONUS_INVITER
    }

@api_router.get("/referral/invited-users")
async def get_invited_users(current_user: dict = Depends(get_current_user)):
    """Davet edilen kullanıcıları listele"""
    invited_users = await db.users.find(
        {"referred_by": current_user["id"]},
        {"username": 1, "created_at": 1, "total_earned": 1}
    ).to_list(100)
    
    return {
        "invited_users": [
            {
                "username": user["username"],
                "joined_at": user.get("created_at"),
                "total_earned": user.get("total_earned", 0)
            }
            for user in invited_users
        ],
        "total_invited": len(invited_users)
    }

# ============ GAME ENDPOINTS ============

@api_router.post("/game/result")
async def submit_game_result(result: GameResult, current_user: dict = Depends(get_current_user)):
    # Get ship multiplier
    active_ship = current_user.get("active_ship", "basic")
    ship_data = SHIP_DATA.get(active_ship, SHIP_DATA["basic"])
    multiplier = ship_data["multiplier"]
    
    # Check active boosts
    active_boosts = current_user.get("active_boosts", [])
    now = datetime.utcnow()
    valid_boosts = []
    boost_multiplier = 1.0
    
    for boost in active_boosts:
        if datetime.fromisoformat(boost["expires_at"]) > now:
            valid_boosts.append(boost)
            boost_multiplier *= boost.get("multiplier", 1.0)
    
    # Calculate final coins
    final_coins = int(result.coins_earned * multiplier * boost_multiplier)
    
    # Update user
    await db.users.update_one(
        {"id": current_user["id"]},
        {
            "$inc": {"coins": final_coins, "total_earned": final_coins},
            "$set": {"active_boosts": valid_boosts}
        }
    )
    
    # Get updated user
    updated_user = await db.users.find_one({"id": current_user["id"]})
    
    return {
        "coins_earned": final_coins,
        "base_coins": result.coins_earned,
        "multiplier": multiplier * boost_multiplier,
        "total_coins": updated_user["coins"],
        "total_earned": updated_user["total_earned"]
    }

@api_router.get("/game/ship-data")
async def get_ship_data(current_user: dict = Depends(get_current_user)):
    active_ship = current_user.get("active_ship", "basic")
    ship = SHIP_DATA.get(active_ship, SHIP_DATA["basic"])
    
    # Check boosts
    active_boosts = current_user.get("active_boosts", [])
    now = datetime.utcnow()
    boost_multiplier = 1.0
    
    for boost in active_boosts:
        if datetime.fromisoformat(boost["expires_at"]) > now:
            boost_multiplier *= boost.get("multiplier", 1.0)
    
    return {
        "ship_id": active_ship,
        "ship_name": ship["name"],
        "base_multiplier": ship["multiplier"],
        "boost_multiplier": boost_multiplier,
        "total_multiplier": ship["multiplier"] * boost_multiplier,
        "speed_bonus": ship["speed"],
        "image": ship["image"]
    }

@api_router.post("/game/select-ship/{ship_id}")
async def select_ship(ship_id: str, current_user: dict = Depends(get_current_user)):
    owned_ships = current_user.get("owned_ships", ["basic"])
    
    if ship_id not in owned_ships:
        raise HTTPException(status_code=400, detail="Bu gemiye sahip değilsiniz")
    
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"active_ship": ship_id}}
    )
    
    return {"message": "Gemi seçildi", "active_ship": ship_id}

# ============ SHOP ENDPOINTS ============

@api_router.get("/shop/items")
async def get_shop_items():
    return {"items": [item.dict() for item in SHOP_ITEMS], "trc20_address": TRC20_ADDRESS}

@api_router.post("/shop/buy-with-coins/{item_id}")
async def buy_with_coins(item_id: str, current_user: dict = Depends(get_current_user)):
    # Find item
    item = next((i for i in SHOP_ITEMS if i.id == item_id), None)
    if not item or item.price_coins is None:
        raise HTTPException(status_code=404, detail="Item bulunamadı veya coin ile alınamaz")
    
    if current_user["coins"] < item.price_coins:
        raise HTTPException(status_code=400, detail="Yetersiz coin")
    
    # Process purchase
    update_data = {"$inc": {"coins": -item.price_coins}}
    
    if item.type == "ship":
        owned_ships = current_user.get("owned_ships", ["basic"])
        if item_id in owned_ships:
            raise HTTPException(status_code=400, detail="Bu gemiye zaten sahipsiniz")
        update_data["$push"] = {"owned_ships": item_id}
    
    await db.users.update_one({"id": current_user["id"]}, update_data)
    
    return {"message": f"{item.name} satın alındı!", "item": item.dict()}

@api_router.post("/shop/submit-payment")
async def submit_payment(payment: PaymentSubmit, current_user: dict = Depends(get_current_user)):
    # Find item
    item = next((i for i in SHOP_ITEMS if i.id == payment.item_id), None)
    if not item or item.price_usdt is None:
        raise HTTPException(status_code=404, detail="Item bulunamadı")
    
    if payment.amount_usdt < item.price_usdt:
        raise HTTPException(status_code=400, detail=f"Yetersiz miktar. Gereken: {item.price_usdt} USDT")
    
    # Create payment request
    payment_req = PaymentRequest(
        user_id=current_user["id"],
        username=current_user["username"],
        tx_hash=payment.tx_hash,
        amount_usdt=payment.amount_usdt,
        item_id=payment.item_id,
        item_name=item.name
    )
    
    await db.payments.insert_one(payment_req.dict())
    
    return {
        "message": "Ödeme bildirimi alındı. Admin onayından sonra hesabınıza eklenecek.",
        "payment_id": payment_req.id
    }

# ============ WITHDRAW ENDPOINTS ============

@api_router.post("/withdraw/request")
async def request_withdraw(withdraw: WithdrawSubmit, current_user: dict = Depends(get_current_user)):
    if withdraw.coins_amount < WITHDRAW_THRESHOLD:
        raise HTTPException(
            status_code=400, 
            detail=f"Minimum para çekme: {WITHDRAW_THRESHOLD} coin. Şu an: {current_user['coins']} coin"
        )
    
    if current_user["coins"] < withdraw.coins_amount:
        raise HTTPException(status_code=400, detail="Yetersiz coin")
    
    usdt_amount = withdraw.coins_amount * USDT_PER_COIN
    
    # Create withdraw request
    withdraw_req = WithdrawRequest(
        user_id=current_user["id"],
        username=current_user["username"],
        coins_amount=withdraw.coins_amount,
        usdt_amount=usdt_amount,
        wallet_address=withdraw.wallet_address
    )
    
    # Deduct coins
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$inc": {"coins": -withdraw.coins_amount}}
    )
    
    await db.withdrawals.insert_one(withdraw_req.dict())
    
    return {
        "message": "Para çekme talebi oluşturuldu",
        "coins_amount": withdraw.coins_amount,
        "usdt_amount": usdt_amount,
        "withdraw_id": withdraw_req.id
    }

@api_router.get("/withdraw/info")
async def get_withdraw_info(current_user: dict = Depends(get_current_user)):
    return {
        "threshold": WITHDRAW_THRESHOLD,
        "usdt_per_coin": USDT_PER_COIN,
        "current_coins": current_user["coins"],
        "can_withdraw": current_user["coins"] >= WITHDRAW_THRESHOLD,
        "potential_usdt": current_user["coins"] * USDT_PER_COIN
    }

# ============ ADMIN ENDPOINTS ============

@api_router.get("/admin/payments")
async def get_pending_payments(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin yetkisi gerekli")
    
    payments = await db.payments.find({"status": "pending"}).to_list(100)
    return {"payments": payments}

@api_router.post("/admin/approve-payment/{payment_id}")
async def approve_payment(payment_id: str, current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin yetkisi gerekli")
    
    payment = await db.payments.find_one({"id": payment_id})
    if not payment:
        raise HTTPException(status_code=404, detail="Ödeme bulunamadı")
    
    if payment["status"] != "pending":
        raise HTTPException(status_code=400, detail="Bu ödeme zaten işlenmiş")
    
    # Find item
    item = next((i for i in SHOP_ITEMS if i.id == payment["item_id"]), None)
    if not item:
        raise HTTPException(status_code=404, detail="Item bulunamadı")
    
    # Process based on item type
    user = await db.users.find_one({"id": payment["user_id"]})
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    
    update_data = {}
    
    if item.type == "ship":
        owned_ships = user.get("owned_ships", ["basic"])
        if item.id not in owned_ships:
            update_data["$push"] = {"owned_ships": item.id}
    elif item.type == "boost":
        # Add boost with expiration
        duration_minutes = 60 if "1h" in item.id else 30
        expires_at = (datetime.utcnow() + timedelta(minutes=duration_minutes)).isoformat()
        boost = {
            "id": item.id,
            "name": item.name,
            "multiplier": item.coin_multiplier,
            "expires_at": expires_at
        }
        update_data["$push"] = {"active_boosts": boost}
    elif item.type == "coins":
        # Add coins based on package
        coins_to_add = 0
        if item.id == "coins_1000":
            coins_to_add = 1000
        elif item.id == "coins_5000":
            coins_to_add = 5500  # +10% bonus
        elif item.id == "coins_15000":
            coins_to_add = 18750  # +25% bonus
        update_data["$inc"] = {"coins": coins_to_add}
    
    if update_data:
        await db.users.update_one({"id": payment["user_id"]}, update_data)
    
    # Update payment status
    await db.payments.update_one(
        {"id": payment_id},
        {"$set": {"status": "approved", "processed_at": datetime.utcnow()}}
    )
    
    return {"message": "Ödeme onaylandı", "item": item.name}

@api_router.post("/admin/reject-payment/{payment_id}")
async def reject_payment(payment_id: str, current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin yetkisi gerekli")
    
    await db.payments.update_one(
        {"id": payment_id},
        {"$set": {"status": "rejected", "processed_at": datetime.utcnow()}}
    )
    
    return {"message": "Ödeme reddedildi"}

@api_router.get("/admin/withdrawals")
async def get_pending_withdrawals(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin yetkisi gerekli")
    
    withdrawals = await db.withdrawals.find({"status": "pending"}).to_list(100)
    return {"withdrawals": withdrawals}

@api_router.post("/admin/process-withdrawal/{withdrawal_id}")
async def process_withdrawal(withdrawal_id: str, approve: bool, current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin yetkisi gerekli")
    
    withdrawal = await db.withdrawals.find_one({"id": withdrawal_id})
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    
    if withdrawal["status"] != "pending":
        raise HTTPException(status_code=400, detail="Bu talep zaten işlenmiş")
    
    new_status = "approved" if approve else "rejected"
    
    # If rejected, refund coins
    if not approve:
        await db.users.update_one(
            {"id": withdrawal["user_id"]},
            {"$inc": {"coins": withdrawal["coins_amount"]}}
        )
    
    await db.withdrawals.update_one(
        {"id": withdrawal_id},
        {"$set": {"status": new_status, "processed_at": datetime.utcnow()}}
    )
    
    return {"message": f"Talep {'onaylandı' if approve else 'reddedildi'}"}

@api_router.post("/admin/make-admin/{user_email}")
async def make_admin(user_email: str):
    """One-time endpoint to create admin - should be secured in production"""
    result = await db.users.update_one(
        {"email": user_email},
        {"$set": {"is_admin": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": f"{user_email} artık admin"}

# ============ LEADERBOARD ============

@api_router.get("/leaderboard")
async def get_leaderboard():
    users = await db.users.find(
        {},
        {"username": 1, "total_earned": 1, "active_ship": 1}
    ).sort("total_earned", -1).limit(50).to_list(50)
    
    leaderboard = []
    for i, user in enumerate(users):
        ship = SHIP_DATA.get(user.get("active_ship", "basic"), SHIP_DATA["basic"])
        leaderboard.append({
            "rank": i + 1,
            "username": user["username"],
            "total_earned": user["total_earned"],
            "ship_image": ship["image"]
        })
    
    return {"leaderboard": leaderboard}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

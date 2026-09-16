import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const file=process.env.DATABASE_FILE||"./data/shop-control.db";
fs.mkdirSync(path.dirname(file),{recursive:true});
export const db=new Database(file);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS shops(
 id TEXT PRIMARY KEY,name TEXT NOT NULL,phone TEXT,email TEXT,currency TEXT NOT NULL DEFAULT 'NGN',created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users(
 id TEXT PRIMARY KEY,shop_id TEXT NOT NULL,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'owner',created_at TEXT NOT NULL,
 FOREIGN KEY(shop_id) REFERENCES shops(id)
);
CREATE TABLE IF NOT EXISTS products(
 id TEXT PRIMARY KEY,shop_id TEXT NOT NULL,name TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'Other',stock INTEGER NOT NULL DEFAULT 0,cost REAL NOT NULL DEFAULT 0,price REAL NOT NULL DEFAULT 0,reorder_level INTEGER NOT NULL DEFAULT 5,created_at TEXT NOT NULL,
 FOREIGN KEY(shop_id) REFERENCES shops(id)
);
CREATE TABLE IF NOT EXISTS sales(
 id TEXT PRIMARY KEY,shop_id TEXT NOT NULL,product_id TEXT NOT NULL,product_name TEXT NOT NULL,qty INTEGER NOT NULL,total REAL NOT NULL,profit REAL NOT NULL,payment TEXT NOT NULL,customer_name TEXT,created_at TEXT NOT NULL,
 FOREIGN KEY(shop_id) REFERENCES shops(id)
);
CREATE TABLE IF NOT EXISTS expenses(
 id TEXT PRIMARY KEY,shop_id TEXT NOT NULL,category TEXT NOT NULL,amount REAL NOT NULL,note TEXT,created_at TEXT NOT NULL,
 FOREIGN KEY(shop_id) REFERENCES shops(id)
);
CREATE TABLE IF NOT EXISTS customers(
 id TEXT PRIMARY KEY,shop_id TEXT NOT NULL,name TEXT NOT NULL,phone TEXT,spent REAL NOT NULL DEFAULT 0,orders INTEGER NOT NULL DEFAULT 0,last_purchase TEXT,
 FOREIGN KEY(shop_id) REFERENCES shops(id)
);
CREATE TABLE IF NOT EXISTS suppliers(
 id TEXT PRIMARY KEY,shop_id TEXT NOT NULL,name TEXT NOT NULL,phone TEXT,products TEXT,moq TEXT,last_price TEXT,
 FOREIGN KEY(shop_id) REFERENCES shops(id)
);
CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_sales_shop_date ON sales(shop_id,created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_shop_date ON expenses(shop_id,created_at);
`);
try { db.exec("ALTER TABLE shops ADD COLUMN currency TEXT NOT NULL DEFAULT 'NGN'"); } catch {}

export const id=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();

export function seedShop(shopId:string){
  const products=[
    ["6pc Luxury Bedsheet","Bedding",4,18000,25000,5],
    ["Frying Pan","Kitchen",23,7000,10500,5],
    ["Pillow Set","Bedding",7,5500,8500,5],
    ["Dinner Set","Kitchen",0,22000,32000,5],
    ["Bath Towel","Bath",14,4500,7000,5],
    ["Duvet","Bedding",8,15000,24000,5]
  ];
  const stmt=db.prepare("INSERT INTO products(id,shop_id,name,category,stock,cost,price,reorder_level,created_at) VALUES(?,?,?,?,?,?,?,?,?)");
  for(const p of products)stmt.run(id(),shopId,...p,now());
  const supplier=db.prepare("INSERT INTO suppliers(id,shop_id,name,phone,products,moq,last_price) VALUES(?,?,?,?,?,?,?)");
  supplier.run(id(),shopId,"ABC Home Products","0803 111 2233","Bedsheet, Duvet","10 units","₦18,000");
  supplier.run(id(),shopId,"Golden Kitchen Wholesale","0814 555 9012","Pans, Dinner Sets","5 units","₦22,000");
}
export function getShopData(shopId:string){
 return {
  products:db.prepare("SELECT * FROM products WHERE shop_id=? ORDER BY name").all(shopId),
  sales:db.prepare("SELECT * FROM sales WHERE shop_id=? ORDER BY created_at DESC LIMIT 100").all(shopId),
  expenses:db.prepare("SELECT * FROM expenses WHERE shop_id=? ORDER BY created_at DESC LIMIT 100").all(shopId),
  customers:db.prepare("SELECT * FROM customers WHERE shop_id=? ORDER BY spent DESC").all(shopId),
  suppliers:db.prepare("SELECT * FROM suppliers WHERE shop_id=? ORDER BY name").all(shopId)
 };
}

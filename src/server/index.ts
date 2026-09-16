import "dotenv/config";
import path from "node:path";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import {db,id,now,seedShop,getShopData} from "./db.js";

const app=express(); app.use(cors()); app.use(express.json());
const SECRET=process.env.JWT_SECRET||"dev-secret-change-me";
const auth=(req:any,res:any,next:any)=>{try{const h=req.headers.authorization||"";if(!h.startsWith("Bearer "))throw 0;req.user=jwt.verify(h.slice(7),SECRET);next()}catch{res.status(401).json({error:"Unauthorized"})}};
const token=(u:any)=>jwt.sign({userId:u.id,shopId:u.shop_id,role:u.role},SECRET,{expiresIn:"30d"});
const ok=(res:any,data:any)=>res.json({ok:true,...data});

app.get("/api/health",(_,res)=>ok(res,{status:"ok"}));

app.post("/api/auth/register",async(req,res)=>{
 const {shopName,name,email,password,phone}=req.body||{};
 if(!shopName||!name||!email||!password)return res.status(400).json({error:"Shop name, name, email and password are required"});
 if(String(password).length<8)return res.status(400).json({error:"Password must be at least 8 characters"});
 if(db.prepare("SELECT id FROM users WHERE email=?").get(email))return res.status(409).json({error:"Email already exists"});
 const shopId=id(),userId=id();
 db.prepare("INSERT INTO shops(id,name,phone,email,created_at) VALUES(?,?,?,?,?)").run(shopId,shopName,phone||"",email,now());
 db.prepare("INSERT INTO users(id,shop_id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)").run(userId,shopId,name,email,await bcrypt.hash(password,12),"owner",now());
 seedShop(shopId);
 const user={id:userId,shop_id:shopId,role:"owner"};
 ok(res,{token:token(user),user:{name,email,shopName}});
});
app.post("/api/auth/login",async(req,res)=>{
 const {email,password}=req.body||{};const u:any=db.prepare("SELECT u.*,s.name shop_name FROM users u JOIN shops s ON s.id=u.shop_id WHERE u.email=?").get(email);
 if(!u||!(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({error:"Invalid email or password"});
 ok(res,{token:token(u),user:{name:u.name,email:u.email,shopName:u.shop_name}});
});

app.get("/api/me",auth,(req:any,res)=>{const u:any=db.prepare("SELECT u.name,u.email,u.role,s.name shopName,s.phone,s.currency FROM users u JOIN shops s ON s.id=u.shop_id WHERE u.id=?").get(req.user.userId);ok(res,{user:u})});
app.put("/api/settings",auth,(req:any,res)=>{
 const {shopName,phone,currency}=req.body||{};
 const allowed=["NGN","USD","GBP","EUR","GHS","KES","ZAR","CAD","AUD","AED","INR"];
 if(currency && !allowed.includes(currency)) return res.status(400).json({error:"Unsupported currency"});
 db.prepare("UPDATE shops SET name=COALESCE(NULLIF(?,''),name), phone=COALESCE(?,phone), currency=COALESCE(?,currency) WHERE id=?").run(shopName||"",phone??null,currency||null,req.user.shopId);
 const shop:any=db.prepare("SELECT name shopName,phone,currency FROM shops WHERE id=?").get(req.user.shopId);
 ok(res,{shop});
});
app.get("/api/data",auth,(req:any,res)=>ok(res,getShopData(req.user.shopId)));

app.post("/api/products",auth,(req:any,res)=>{
 const {name,category="Other",stock=0,cost=0,price=0,reorderLevel=5}=req.body||{};
 if(!name)return res.status(400).json({error:"Product name required"});
 const product={id:id(),shopId:req.user.shopId,name,category,stock:Number(stock),cost:Number(cost),price:Number(price),reorderLevel:Number(reorderLevel),createdAt:now()};
 db.prepare("INSERT INTO products(id,shop_id,name,category,stock,cost,price,reorder_level,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run(product.id,product.shopId,product.name,product.category,product.stock,product.cost,product.price,product.reorderLevel,product.createdAt);
 ok(res,{product});
});
app.post("/api/products/:id/restock",auth,(req:any,res)=>{
 const {qty,cost}=req.body||{};const p:any=db.prepare("SELECT * FROM products WHERE id=? AND shop_id=?").get(req.params.id,req.user.shopId);
 if(!p||Number(qty)<=0)return res.status(400).json({error:"Invalid product or quantity"});
 db.prepare("UPDATE products SET stock=stock+?,cost=COALESCE(?,cost) WHERE id=? AND shop_id=?").run(Number(qty),cost?Number(cost):null,p.id,req.user.shopId);
 ok(res,{product:db.prepare("SELECT * FROM products WHERE id=?").get(p.id)});
});

app.post("/api/sales",auth,(req:any,res)=>{
 const {productId,qty=1,payment="Cash",customerName=""}=req.body||{};
 const p:any=db.prepare("SELECT * FROM products WHERE id=? AND shop_id=?").get(productId,req.user.shopId);
 if(!p||Number(qty)<1||p.stock<Number(qty))return res.status(400).json({error:"Insufficient stock"});
 const q=Number(qty),total=p.price*q,profit=(p.price-p.cost)*q,saleId=id(),date=now();
 const tx=db.transaction(()=>{
  db.prepare("UPDATE products SET stock=stock-? WHERE id=? AND shop_id=?").run(q,p.id,req.user.shopId);
  db.prepare("INSERT INTO sales(id,shop_id,product_id,product_name,qty,total,profit,payment,customer_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(saleId,req.user.shopId,p.id,p.name,q,total,profit,payment,customerName||null,date);
  if(customerName){
   const c:any=db.prepare("SELECT * FROM customers WHERE shop_id=? AND lower(name)=lower(?)").get(req.user.shopId,customerName);
   if(c)db.prepare("UPDATE customers SET spent=spent+?,orders=orders+1,last_purchase=? WHERE id=?").run(total,date,c.id);
   else db.prepare("INSERT INTO customers(id,shop_id,name,spent,orders,last_purchase) VALUES(?,?,?,?,?,?)").run(id(),req.user.shopId,customerName,total,1,date);
  }
 });tx();
 ok(res,{sale:{id:saleId,total,profit}});
});

app.post("/api/expenses",auth,(req:any,res)=>{
 const {category,amount,note=""}=req.body||{};if(!category||Number(amount)<=0)return res.status(400).json({error:"Category and positive amount required"});
 const expense={id:id(),shopId:req.user.shopId,category,amount:Number(amount),note,createdAt:now()};
 db.prepare("INSERT INTO expenses(id,shop_id,category,amount,note,created_at) VALUES(?,?,?,?,?,?)").run(expense.id,expense.shopId,expense.category,expense.amount,expense.note,expense.createdAt);
 ok(res,{expense});
});

app.post("/api/suppliers",auth,(req:any,res)=>{
 const {name,phone="",products="",moq="",lastPrice=""}=req.body||{};if(!name)return res.status(400).json({error:"Supplier name required"});
 const supplier={id:id(),shopId:req.user.shopId,name,phone,products,moq,lastPrice};
 db.prepare("INSERT INTO suppliers(id,shop_id,name,phone,products,moq,last_price) VALUES(?,?,?,?,?,?,?)").run(supplier.id,supplier.shopId,supplier.name,supplier.phone,supplier.products,supplier.moq,supplier.lastPrice);
 ok(res,{supplier});
});

app.get("/api/dashboard",auth,(req:any,res)=>{
 const sales:any=db.prepare("SELECT COALESCE(SUM(total),0) total,COALESCE(SUM(profit),0) profit,COUNT(*) count FROM sales WHERE shop_id=? AND date(created_at)>=date('now','start of month')").get(req.user.shopId);
 const today:any=db.prepare("SELECT COALESCE(SUM(total),0) total,COALESCE(SUM(profit),0) profit,COUNT(*) count FROM sales WHERE shop_id=? AND date(created_at)=date('now')").get(req.user.shopId);
 const expenses:any=db.prepare("SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE shop_id=? AND date(created_at)>=date('now','start of month')").get(req.user.shopId);
 const low:any=db.prepare("SELECT COUNT(*) count FROM products WHERE shop_id=? AND stock<=reorder_level").get(req.user.shopId);
 const out:any=db.prepare("SELECT COUNT(*) count FROM products WHERE shop_id=? AND stock=0").get(req.user.shopId);
 ok(res,{dashboard:{todaySales:today.total,todayProfit:today.profit,todayTransactions:today.count,monthSales:sales.total,monthProfit:sales.profit,monthTransactions:sales.count,monthExpenses:expenses.total,lowStock:low.count,outOfStock:out.count}});
});

const webRoot=process.env.WEB_ROOT||path.resolve("dist");
app.use(express.static(webRoot));
app.use((req,res,next)=>{
  if(req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(webRoot,"index.html"),err=>{if(err)next(err)});
});
const port=Number(process.env.PORT||4000);
app.listen(port,"0.0.0.0",()=>console.log(`Shop Control API running on port ${port}`));

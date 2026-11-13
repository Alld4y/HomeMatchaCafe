import { Pool } from 'pg';

// ตั้งค่าการเชื่อมต่อฐานข้อมูล
const pool = new Pool({
  user: 'postgres',      // ชื่อผู้ใช้ Postgres
  host: 'alldaygrow.tplinkdns.com', // หรือ IP ของ Server 
  database: 'HomeMatchaCafe',  // ชื่อฐานข้อมูล
  password: 'icloud03102019',  // รหัสผ่าน
  port: 5432             // Port มาตรฐานของ Postgres
});

export default pool;
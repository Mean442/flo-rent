'use strict';

/* ข้อมูลตั้งต้น: หมวดหมู่ / บัญชีทดลอง / สินค้า / การจอง / คำขอตามหา */

const { hashPassword } = require('./auth');

const DAY = 86400000;

const CATEGORIES = [
  { key: 'crew', num: '01', name: 'ของใช้คอนออกกอง', emoji: '🎬', sub: 'กล้อง · ขาตั้งกล้อง · อุปกรณ์แสง-เสียง' },
  { key: 'fashion', num: '02', name: 'แฟชั่น', emoji: '👗', sub: 'เสื้อผ้า · อุปกรณ์แต่งหน้า · ชุดเครื่องสำอาง' },
  { key: 'sport', num: '03', name: 'อุปกรณ์กีฬา', emoji: '🏀', sub: 'บาส · ฟุตบอล · จักรยาน' },
  { key: 'party', num: '04', name: 'งานบันเทิง', emoji: '🪩', sub: 'แท่งไฟ · เครื่องเสียง · เวที' },
  { key: 'gadget', num: '05', name: 'อิเล็กทรอนิกส์', emoji: '📱', sub: 'โทรศัพท์ · ลำโพง · โปรเจกเตอร์' },
  { key: 'general', num: '06', name: 'อุปกรณ์ทั่วไป', emoji: '🪑', sub: 'โต๊ะ · เก้าอี้ · ของใช้ในบ้าน' }
];

const ITEMS = [
  {
    id: 'cam-sony-a7iii', cat: 'crew', title: 'กล้อง Sony A7 III + เลนส์ 28-70', emoji: '📷',
    price: 1500, deposit: 8000, owner: 'พี่กันต์ สตูดิโอกลางซอย', rating: 4.9, reviews: 42,
    location: 'กรุงเทพฯ · อารีย์', tags: ['กล้อง', 'camera', 'วิดีโอ', 'คอนเทนต์'],
    desc: 'ชุดกล้อง Full Frame พร้อมเลนส์คิต 28-70 เหมาะกับงานถ่ายคอนเทนต์และงานออกกอง ไม่ต้องซื้อให้หนักกระเป๋า',
    terms: 'รับได้ 1–7 วัน · แบตเตอรี่ 2 ก้อน + การ์ด 64GB · นัดรับที่อารีย์หรือส่ง Kerry'
  },
  {
    id: 'tripod-manfrotto', cat: 'crew', title: 'ขาตั้งกล้อง Manfrotto Befree', emoji: '🦿',
    price: 250, deposit: 2000, owner: 'น้องมิ้นท์ บีทีเอสอ่อนนุช', rating: 4.8, reviews: 31,
    location: 'กรุงเทพฯ · อ่อนนุช', tags: ['ขาตั้ง', 'tripod', 'กล้อง'],
    desc: 'ขาตั้งคาร์บอนน้ำหนักเบา พับได้ 43 ซม. รับน้ำหนักได้ 4 กก. พร้อมหัวบอล',
    terms: 'รับได้ 1–5 วัน · หากชำรุดเสียหายหักเงินมัดจำตามจริง'
  },
  {
    id: 'light-studio-kit', cat: 'crew', title: 'ชุดไฟสตูดิโอ 2 ดวง + ฉากขาว', emoji: '💡',
    price: 800, deposit: 3000, owner: 'พี่โอ๊ต สตูดิโอรัชดา', rating: 4.7, reviews: 18,
    location: 'กรุงเทพฯ · รัชดา', tags: ['ไฟ', 'light', 'สตูดิโอ', 'ถ่ายสินค้า'],
    desc: 'Softbox 60x90 สองดวงพร้อมขาตั้งและฉากขาว 2x4 ม. พอสำหรับถ่ายสินค้าขนาดเล็กถึงกลาง',
    terms: 'รับได้ 1–3 วัน · มีบริการติดตั้งในพื้นที่กรุงเทพฯ (+300 บาท)'
  },
  {
    id: 'mic-rode-wireless', cat: 'crew', title: 'ไมโครโฟน Rode Wireless GO II', emoji: '🎙️',
    price: 350, deposit: 2500, owner: 'พี่ฟ้า คอนเทนต์ดี', rating: 5.0, reviews: 27,
    location: 'กรุงเทพฯ · ลาดพร้าว', tags: ['ไมค์', 'ไมโครโฟน', 'วิดีโอ', 'สัมภาษณ์'],
    desc: 'ไมค์ไร้สาย 2 ตัวส่ง 1 รับ บันทึกเสียงในตัว ใช้กับกล้องหรือมือถือได้',
    terms: 'รับได้ 1–5 วัน · ต้องคืนพร้อมกล่องและสายครบชุด'
  },
  {
    id: 'dress-satin-red', cat: 'fashion', title: 'เดรสราตรี Satin สีแดง (S–M)', emoji: '👗',
    price: 450, deposit: 1500, owner: 'คุณแพร สยาม', rating: 4.6, reviews: 22,
    location: 'กรุงเทพฯ · สยาม', tags: ['เดรส', 'ชุดราตรี', 'แฟชั่น', 'งานปาร์ตี้'],
    desc: 'เดรสผ้าซาตินสีแดงเข้ม ทรงมิดชิด ใส่ได้งานเลี้ยงหรือถ่ายพรีเวดดิ้ง',
    terms: 'รับได้ 2–4 วัน · ซักแห้งก่อนคืน · ไซซ์ S–M (รอบอก 32–34 นิ้ว)'
  },
  {
    id: 'bag-chanel-classic', cat: 'fashion', title: 'กระเป๋า Chanel Classic Flap (ของแท้)', emoji: '👜',
    price: 1200, deposit: 20000, owner: 'ร้านลักซ์เชียร์ เอ็มสเฟียร์', rating: 4.9, reviews: 64,
    location: 'กรุงเทพฯ · เอ็มสเฟียร์', tags: ['กระเป๋า', 'แบรนด์เนม', 'แฟชั่น', 'งานแต่ง'],
    desc: 'กระเป๋าแท้พร้อมใบรับรองและกล่อง เหมาะกับงานแต่งงานและอีเวนต์สำคัญ',
    terms: 'รับได้ 1–3 วัน · ต้องยืนยันตัวตนและวางมัดจำเต็มจำนวน · ตรวจสภาพก่อน–หลังรับ'
  },
  {
    id: 'makeup-kit-mac', cat: 'fashion', title: 'ชุดเครื่องสำอาง MAC Pro (ใช้ได้ 1 งาน)', emoji: '💄',
    price: 600, deposit: 2000, owner: 'พี่จอย เมคอัพอาร์ติสต์', rating: 4.5, reviews: 12,
    location: 'กรุงเทพฯ · พญาไท', tags: ['เครื่องสำอาง', 'แต่งหน้า', 'แฟชั่น'],
    desc: 'ชุดเครื่องสำอางมืออาชีพสำหรับงานถ่ายหรืออีเวนต์ พร้อมแปรงและพาเลตต์',
    terms: 'รับได้ 1–2 วัน · อุปกรณ์ทำความสะอาดให้ก่อนคืน'
  },
  {
    id: 'bike-trek-domane', cat: 'sport', title: 'จักรยานเสือหมอบ Trek Domane', emoji: '🚴',
    price: 300, deposit: 3000, owner: 'พี่บอส ไบค์แอนด์บีน', rating: 4.8, reviews: 39,
    location: 'นนทบุรี · เมืองทอง', tags: ['จักรยาน', 'กีฬา', 'ปั่น'],
    desc: 'จักรยานเสือหมอบไซซ์ 54 เหมาะปั่นในเมืองและทริปวันหยุด พร้อมหมวกและไฟ',
    terms: 'รับได้ 1–7 วัน · ต้องมีประสบการณ์ปั่น · หากยางแตกผู้เช่ารับผิดชอบ'
  },
  {
    id: 'basketball-spalding', cat: 'sport', title: 'ลูกบาส Spalding + สแตนด์ติดตั้ง', emoji: '🏀',
    price: 100, deposit: 500, owner: 'พี่เต้ ยิมปากซอย', rating: 4.4, reviews: 7,
    location: 'กรุงเทพฯ · บางนา', tags: ['บาส', 'กีฬา', 'ลูกบอล'],
    desc: 'ลูกบาสซ้อมกลางแจ้งพร้อมสแตนด์แบบถอดประกอบ',
    terms: 'รับได้ 1–3 วัน · คืนพร้อมสูบลม'
  },
  {
    id: 'lightstick-pack', cat: 'party', title: 'แท่งไฟ LED (ชุด 2 อัน)', emoji: '🪩',
    price: 150, deposit: 500, owner: 'น้องข้าวฟาง คอนเสิร์ตคลับ', rating: 4.9, reviews: 88,
    location: 'กรุงเทพฯ · ราชเทวี', tags: ['แท่งไฟ', 'คอนเสิร์ต', 'งานบันเทิง'],
    desc: 'แท่งไฟ LED เปลี่ยนสีได้ 2 อันพร้อมสายคล้อง ใส่คอนเสิร์ตหรือปาร์ตี้',
    terms: 'รับได้ 1–2 วัน · ต้องคืนพร้อมแบตเตอรี่ที่ชาร์จแล้ว'
  },
  {
    id: 'speaker-jbl-partybox', cat: 'party', title: 'ลำโพง JBL PartyBox 310', emoji: '🔊',
    price: 700, deposit: 3000, owner: 'พี่กอล์ฟ ซาวด์ซิสเต็ม', rating: 4.7, reviews: 25,
    location: 'กรุงเทพฯ · บางแค', tags: ['ลำโพง', 'เสียง', 'งานเลี้ยง'],
    desc: 'ลำโพงรุ่นใหญ่ 240 วัตต์ ไฟ LED ต่อไมค์ได้ ใช้ในงานกลางแจ้งได้',
    terms: 'รับได้ 1–3 วัน · มีค่าส่งในเขตกรุงเทพฯ 300 บาท'
  },
  {
    id: 'iphone-14-pro', cat: 'gadget', title: 'iPhone 14 Pro (สำหรับถ่ายคอนเทนต์)', emoji: '📱',
    price: 400, deposit: 10000, owner: 'พี่นัท เทคเรนท์', rating: 4.8, reviews: 51,
    location: 'กรุงเทพฯ · พร้อมพงษ์', tags: ['โทรศัพท์', 'ถ่ายวิดีโอ', 'คอนเทนต์'],
    desc: 'ว่างสำหรับงานถ่าย กล้อง 48MP พร้อมกิมบอลติดมือถือ',
    terms: 'รับได้ 1–7 วัน · ต้องยืนยันตัวตน · ห้ามติดตั้งบัญชี iCloud'
  },
  {
    id: 'projector-epson', cat: 'gadget', title: 'โปรเจกเตอร์ Epson Full HD', emoji: '📽️',
    price: 900, deposit: 5000, owner: 'พี่หนู ริก้าเรนท์', rating: 4.6, reviews: 20,
    location: 'กรุงเทพฯ · ปทุมวัน', tags: ['โปรเจกเตอร์', 'ประชุม', 'หนังกลางแปลง'],
    desc: 'โปรเจกเตอร์ 3000 lumen พร้อมจอ 100 นิ้วและรีโมต',
    terms: 'รับได้ 1–3 วัน · ต้องมีปลั๊กไฟใกล้อุปกรณ์'
  },
  {
    id: 'table-folding-180', cat: 'general', title: 'โต๊ะพับ 1.8 ม. (ชุด 10 ตัว)', emoji: '🪑',
    price: 80, deposit: 300, owner: 'พี่แอน อีเวนต์ซัพพลาย', rating: 4.5, reviews: 16,
    location: 'ปทุมธานี · รังสิต', tags: ['โต๊ะ', 'งานอีเวนต์', 'ของใช้'],
    desc: 'โต๊ะพับขาเหล็ก 10 ตัว เหมาะงานแจกของ งานบุญ และงานโรงเรียน',
    terms: 'รับได้ 1–3 วัน · ค่าขนส่งขึ้นกับพื้นที่'
  },
  {
    id: 'chair-ergonomic', cat: 'general', title: 'เก้าอี้ทำงาน Ergonomic', emoji: '💺',
    price: 120, deposit: 1000, owner: 'น้องเพชร เวิร์กฟรอมโฮม', rating: 4.7, reviews: 9,
    location: 'ขอนแก่น · เมือง', tags: ['เก้าอี้', 'ทำงาน', 'ของใช้'],
    desc: 'เก้าอี้ปรับระดับได้ มีที่รองเอว เหมาะกับช่วงทำงานจากบ้าน',
    terms: 'รับได้ 3–30 วัน · ส่งถึงบ้านในเขตเมืองขอนแก่น'
  },
  {
    id: 'tent-4p', cat: 'general', title: 'เต็นท์แคมป์ปิ้ง 4 คน', emoji: '⛺',
    price: 350, deposit: 1500, owner: 'พี่ตูน แคมป์คลับ', rating: 4.8, reviews: 33,
    location: 'เชียงใหม่ · นิมมาน', tags: ['เต็นท์', 'แคมป์ปิ้ง', 'ท่องเที่ยว'],
    desc: 'เต็นท์กันน้ำ 2 ชั้น 4 คน พร้อมผ้าปูและตะเกียงพกพา',
    terms: 'รับได้ 2–5 วัน · ต้องคืนแบบตากแห้ง'
  }
];

function iso(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function dayString(offsetDays) {
  return new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
}

function build() {
  const now = Date.now();

  const users = [
    {
      id: 'u-admin', name: 'ผู้ดูแล FLO-RENT', email: 'admin@flo-rent.co',
      passHash: hashPassword('admin1234'), role: 'admin', status: 'active',
      phone: '02-000-0000', age: 30, location: 'กรุงเทพฯ', avatar: '🛠️',
      bio: 'ทีมงาน FLO-RENT ดูแลประกาศและการจอง', rating: 5, reviews: 0,
      joinedAt: iso(-200 * DAY)
    },
    {
      id: 'u-demo', name: 'เดโม่ ผู้เช่ามือใหม่', email: 'demo@flo-rent.co',
      passHash: hashPassword('demo1234'), role: 'user', status: 'active',
      phone: '081-234-5678', age: 22, location: 'กรุงเทพฯ · อารีย์', avatar: '🐥',
      bio: 'ชอบเช่าของใช้ครั้งเดียวจบ มากกว่าซื้อเก็บไว้', rating: 4.9, reviews: 6,
      joinedAt: iso(-96 * DAY)
    },
    {
      id: 'u-owner', name: 'พี่กันต์ สตูดิโอกลางซอย', email: 'owner@flo-rent.co',
      passHash: hashPassword('owner1234'), role: 'user', status: 'active',
      phone: '089-555-1212', age: 34, location: 'กรุงเทพฯ · อารีย์', avatar: '🎬',
      bio: 'ปล่อยกล้องและอุปกรณ์ออกกองให้คนทำงานสร้างสรรค์', rating: 4.9, reviews: 42,
      joinedAt: iso(-140 * DAY)
    }
  ];

  const items = ITEMS.map(function (item, index) {
    return Object.assign({
      ownerId: 'u-owner',
      status: 'published',
      createdAt: iso(-(index + 1) * DAY)
    }, item);
  });

  const bookings = [
    {
      code: 'FLR-DEMO2', itemId: 'projector-epson', itemTitle: 'โปรเจกเตอร์ Epson Full HD',
      itemCat: 'gadget', itemEmoji: '📽️',
      owner: 'พี่หนู ริก้าเรนท์', ownerId: 'u-owner', userId: 'u-demo', userName: 'เดโม่ ผู้เช่ามือใหม่',
      status: 'active', start: dayString(0), end: dayString(2), days: 2,
      dayPrice: 900, deposit: 5000, total: 6800, createdAt: iso(-1 * DAY)
    },
    {
      code: 'FLR-DEMO1', itemId: 'cam-sony-a7iii', itemTitle: 'กล้อง Sony A7 III + เลนส์ 28-70',
      itemCat: 'crew', itemEmoji: '📷',
      owner: 'พี่กันต์ สตูดิโอกลางซอย', ownerId: 'u-owner', userId: 'u-demo', userName: 'เดโม่ ผู้เช่ามือใหม่',
      status: 'returned', start: dayString(-12), end: dayString(-10), days: 2,
      dayPrice: 1500, deposit: 8000, total: 11000, createdAt: iso(-13 * DAY), returnedAt: iso(-10 * DAY)
    }
  ];

  const requests = [
    {
      id: 'rq-1', want: 'ตามหาเดรสราตรีสีแดง ไซซ์ S', cat: 'fashion', budget: 500,
      when: '20 ธ.ค.', name: 'น้องฟ้า', userId: 'u-demo', createdAt: iso(-2 * DAY)
    },
    {
      id: 'rq-2', want: 'ตามหากล้อง 4K + ไมค์ 2 ตัว สำหรับคอนเสิร์ต 3 วัน', cat: 'crew', budget: 2000,
      when: '2–4 ม.ค.', name: 'ทีมโปรดักชัน บี', userId: 'u-owner', createdAt: iso(-3 * DAY)
    },
    {
      id: 'rq-3', want: 'ตามหาแท่งไฟและป้ายไฟชื่อ สำหรับงานเปิดตัว', cat: 'party', budget: 300,
      when: '12 ธ.ค.', name: 'พี่จูน', userId: null, createdAt: iso(-4 * DAY)
    }
  ];

  return {
    version: 1,
    users: users,
    sessions: [],
    items: items,
    bookings: bookings,
    requests: requests,
    meta: { seededAt: new Date(now).toISOString(), name: 'FLO-RENT' }
  };
}

module.exports = { build, CATEGORIES };

// pages/constants/uzbekistanDistricts.js — O'zbekiston viloyatlari va tumanlar
//
// Auth.jsx ichida hardcoded edi; ro'yxatdan boshqa sahifalar ham foydalanishi
// va Auth.jsx kichikroq bo'lishi uchun shu yerga ajratildi. Build (Olympy.html
// dagi <script> tartibi) bu faylni Auth.jsx'dan OLDIN yuklaydi, shuning uchun
// UZBEKISTAN_DISTRICTS / UZBEKISTAN_REGIONS global scope'da undan oldin
// ta'riflanadi.
const UZBEKISTAN_DISTRICTS = {
  'Andijon viloyati': ['Bo‘ston', 'Ulug‘nor', 'Jalaquduq', 'Oltinko‘l', 'Andijon', 'Asaka', 'Baliqchi', 'Buloqboshi', 'Izboskan', 'Qo‘rg‘ontepa', 'Marhamat', 'Paxtaobod', 'Xo‘jaobod', 'Shahrixon'],
  'Buxoro viloyati': ['Olot', 'Buxoro', 'Vobkent', 'G‘ijduvon', 'Jondor', 'Kogon', 'Qorako‘l', 'Qorovulbozor', 'Peshku', 'Romitan', 'Shofirkon'],
  'Farg‘ona viloyati': ['Oltiariq', 'Bag‘dod', 'Beshariq', 'Buvayda', 'Dang‘ara', 'Farg‘ona', 'Furqat', 'Qo‘shtepa', 'Quva', 'Rishton', 'So‘x', 'Toshloq', 'Uchko‘prik', 'O‘zbekiston', 'Yozyovon'],
  'Jizzax viloyati': ['Arnasoy', 'Baxmal', 'Do‘stlik', 'Forish', 'G‘allaorol', 'Sharof Rashidov', 'Mirzacho‘l', 'Paxtakor', 'Yangiobod', 'Zomin', 'Zafarobod', 'Zarbdor'],
  'Xorazm viloyati': ['Bog‘ot', 'Gurlan', 'Xonqa', 'Hazorasp', 'Xiva', 'Qo‘shko‘pir', 'Shovot', 'Urganch', 'Yangiariq', 'Yangibozor', 'Tuproqqal’a'],
  'Namangan viloyati': ['Chortoq', 'Chust', 'Kosonsoy', 'Mingbuloq', 'Namangan', 'Norin', 'Pop', 'To‘raqo‘rg‘on', 'Uchqo‘rg‘on', 'Uychi', 'Yangiqo‘rg‘on'],
  'Navoiy viloyati': ['Konimex', 'Karmana', 'Qiziltepa', 'Xatirchi', 'Navbahor', 'Nurota', 'Tomdi', 'Uchquduq'],
  'Qashqadaryo viloyati': ['Chiroqchi', 'Dehqonobod', 'G‘uzor', 'Qamashi', 'Qarshi', 'Koson', 'Kasbi', 'Kitob', 'Mirishkor', 'Muborak', 'Nishon', 'Shahrisabz', 'Yakkabog‘', 'Ko‘kdala'],
  'Samarqand viloyati': ['Bulung‘ur', 'Ishtixon', 'Jomboy', 'Kattaqo‘rg‘on', 'Qo‘shrabot', 'Narpay', 'Nurobod', 'Oqdaryo', 'Paxtachi', 'Payariq', 'Pastdarg‘om', 'Samarqand', 'Toyloq', 'Urgut'],
  'Surxondaryo viloyati': ['Angor', 'Boysun', 'Denov', 'Jarqo‘rg‘on', 'Qiziriq', 'Qumqo‘rg‘on', 'Muzrabot', 'Oltinsoy', 'Sariosiyo', 'Sherobod', 'Sho‘rchi', 'Termiz', 'Uzun', 'Bandixon'],
  'Sirdaryo viloyati': ['Oqoltin', 'Boyovut', 'Guliston', 'Xovos', 'Mirzaobod', 'Sayxunobod', 'Sardoba', 'Sirdaryo'],
  'Toshkent viloyati': ['Oqqo‘rg‘on', 'Ohangaron', 'Bekobod', 'Bo‘stonliq', 'Bo‘ka', 'Zangiota', 'Qibray', 'Quyi Chirchiq', 'Parkent', 'Piskent', 'Toshkent', 'O‘rta Chirchiq', 'Chinoz', 'Yuqori Chirchiq', 'Yangiyo‘l'],
  'Qoraqalpog‘iston Respublikasi': ['Bo‘zatov', 'Amudaryo', 'Beruniy', 'Qanliko‘l', 'Qorao‘zak', 'Kegeyli', 'Qo‘ng‘irot', 'Mo‘ynoq', 'Nukus', 'Taxiatosh', 'Taxtako‘pir', 'To‘rtko‘l', 'Xo‘jayli', 'Chimboy', 'Shumanay', 'Ellikqal’a'],
  'Toshkent shahri': ['Bektemir', 'Chilonzor', 'Yashnobod', 'Mirobod', 'Mirzo Ulug‘bek', 'Sergeli', 'Shayxontohur', 'Olmazor', 'Uchtepa', 'Yakkasaroy', 'Yunusobod', 'Yangihayot'],
};
const UZBEKISTAN_REGIONS = Object.keys(UZBEKISTAN_DISTRICTS);

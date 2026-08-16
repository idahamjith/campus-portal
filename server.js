const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');

// Setup upload directory
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Setup multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});
const upload = multer({ storage: storage });

// Initialize SQLite DB
const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    body TEXT,
    date TEXT,
    department TEXT,
    tag TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    professor TEXT,
    department TEXT,
    file_path TEXT,
    file_size TEXT,
    upload_date TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    url TEXT,
    department TEXT,
    upload_date TEXT
  )`);
});

const app = express();
app.use(bodyParser.json());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

// --- VAPID ---
const publicVapidKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLj8eLlsnCpo';
const privateVapidKey = 'xK0dK-7pS_D1uT7jUQQ_z-A8P_lWn1Q1Yq6XN6A7JXY'; // In production, keep this secret!

webpush.setVapidDetails(
  'mailto:test@test.com',
  publicVapidKey,
  privateVapidKey
);

let subscriptions = [];

app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  const exists = subscriptions.find(sub => sub.endpoint === subscription.endpoint);
  if (!exists) {
      subscriptions.push(subscription);
      console.log('New subscription added. Total:', subscriptions.length);
  }
  res.status(201).json({});
});

app.post('/api/sendPush', (req, res) => {
  const { title, body } = req.body;
  const payload = JSON.stringify({
    title: title || 'Admin Broadcast',
    body: body || 'You have a new message from the admin.',
    icon: 'icon.svg',
    url: './dashboard.html'
  });

  const promises = subscriptions.map((subscription, index) => {
      return webpush.sendNotification(subscription, payload).catch(error => {
          if (error.statusCode === 410 || error.statusCode === 404) {
              subscriptions.splice(index, 1);
          }
      });
  });

  Promise.all(promises).then(() => {
      res.status(200).json({ success: true, sent: subscriptions.length });
  });
});

// --- API ROUTES ---

// Announcements
app.get('/api/announcements', (req, res) => {
  db.all("SELECT * FROM announcements ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({error: err.message});
    res.json(rows);
  });
});

app.post('/api/announcements', (req, res) => {
  const { title, body, department, tag } = req.body;
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  db.run(`INSERT INTO announcements (title, body, date, department, tag) VALUES (?, ?, ?, ?, ?)`, 
    [title, body, date, department, tag], function(err) {
    if (err) return res.status(500).json({error: err.message});
    res.status(201).json({ id: this.lastID });
  });
});

// Notes
app.get('/api/notes', (req, res) => {
  db.all("SELECT * FROM notes ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({error: err.message});
    res.json(rows);
  });
});

app.post('/api/notes', upload.single('noteFile'), (req, res) => {
  const { title, professor, department } = req.body;
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  let file_path = '';
  let sizeMb = '0 MB';
  
  if (req.file) {
    file_path = '/public/uploads/' + req.file.filename;
    sizeMb = (req.file.size / (1024 * 1024)).toFixed(1) + ' MB';
    if (sizeMb === '0.0 MB') sizeMb = (req.file.size / 1024).toFixed(1) + ' KB';
  }
  
  db.run(`INSERT INTO notes (title, professor, department, file_path, file_size, upload_date) VALUES (?, ?, ?, ?, ?, ?)`, 
    [title, professor, department, file_path, sizeMb, date], function(err) {
    if (err) return res.status(500).json({error: err.message});
    res.status(201).json({ id: this.lastID });
  });
});

// Videos
app.get('/api/videos', (req, res) => {
  db.all("SELECT * FROM videos ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({error: err.message});
    res.json(rows);
  });
});

app.post('/api/videos', (req, res) => {
  const { title, description, url, department } = req.body;
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  db.run(`INSERT INTO videos (title, description, url, department, upload_date) VALUES (?, ?, ?, ?, ?)`, 
    [title, description, url, department, date], function(err) {
    if (err) return res.status(500).json({error: err.message});
    res.status(201).json({ id: this.lastID });
  });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server started on http://localhost:${PORT}`));

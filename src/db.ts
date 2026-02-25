import Database from 'better-sqlite3';
import path from 'path';


const db = new Database(path.join(__dirname,'..','database.sqlite'));


db.exec(`
    CREATE TABLE IF NOT EXISTS Contact (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phoneNumber TEXT,
        email TEXT,
        linkedID INTEGER,
        linkPrecedence TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        deletedAt TEXT
    )
`);

export default db;

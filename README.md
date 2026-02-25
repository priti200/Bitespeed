# Bitespeed Identity Reconciliation

A backend web service that identifies and links customer contacts across multiple purchases, even when different email addresses and phone numbers are used.

## Live Endpoint
```
POST https://bitespeed-2t1m.onrender.com/identify
```

---

## The Problem

Imagine an online store where a customer checks out multiple times using different contact details each time. From the store's perspective, these look like completely different people. But they're not - it's the same person.

The challenge is: **how do you figure out that two different sets of contact information belong to the same person, and link them together?**

This is called identity reconciliation.

---

## My Mental Model

Before writing any code, I thought about this like a detective problem.

Every customer has a **cluster** of contact information. One contact is the **primary** - the oldest, the source of truth. Everything else linked to it is **secondary**.

When a new request comes in, there are five possible situations:

1. **Nobody matches** → This is a brand new customer. Create a primary contact.
2. **Someone matches, no new info** → We already know everything. Just return the cluster.
3. **Someone matches, new info** → Same person, new detail. Create a secondary contact.
4. **Two separate clusters get bridged** → A request contains info from two different primaries. They're the same person. Merge them — older primary wins, newer becomes secondary.
5. **Always** → Return the full consolidated view of the cluster.

The key insight is the **OR query**. When we search the database, we look for contacts where `email = input` OR `phoneNumber = input`. This means a single request can match two completely separate clusters at once - which is exactly how we detect the merge case.

---

## How I Built It

### Step 1 — Project Setup

Started with a clean Node.js + TypeScript project. TypeScript was chosen because it catches bugs before runtime — if you try to access a field that doesn't exist, it tells you immediately while writing code, not when a user hits your endpoint.

### Step 2 — Database Layer (`src/db.ts`)

Used SQLite via `better-sqlite3`. SQLite is a file-based database - no server to set up, no credentials, just a single `.sqlite` file. Perfect for this use case.

The Contact table schema:
- `id` — unique identifier, auto assigned
- `email` and `phoneNumber` — both optional, either can be null
- `linkedId` — points to the primary contact's id (null if this contact is primary)
- `linkPrecedence` — either `"primary"` or `"secondary"`
- `createdAt`, `updatedAt`, `deletedAt` — timestamps stored as ISO strings

### Step 3 — Identity Reconciliation Logic (`src/identify.ts`)

This is the brain of the service. The logic flows like this:

**Find matches:**
```sql
SELECT * FROM Contact WHERE email = ? OR phoneNumber = ?
```
The OR is what makes everything work. One query can find contacts from two completely separate clusters.

**Find the full cluster:**
From the matching contacts, collect their root primary IDs (walking up from secondary to primary if needed). Then fetch everyone who belongs to those primaries.

**Merge if needed:**
If the cluster contains more than one primary, sort them by `createdAt`. The oldest stays primary. All others get updated to secondary, pointing to the oldest primary. Their existing secondaries get re-pointed too.

**Create secondary if new info:**
Check if the incoming email or phone is new to the cluster. If yes, insert a new secondary contact to record this new piece of information.

**Build response:**
Primary's email and phone go first in their respective arrays. Then secondaries follow. Deduplicate everything.

### Step 4 — Express Server (`src/index.ts`)

A minimal Express server with a single POST `/identify` endpoint. Reads email and phoneNumber from the request body, calls the reconciliation logic, returns the consolidated contact.

---

## Tech Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Framework:** Express
- **Database:** SQLite (better-sqlite3)
- **Hosting:** Render

---

## Local Setup
```bash
git clone https://github.com/priti200/Bitespeed.git
cd Bitespeed
npm install
npm run dev
```

Server starts on `http://localhost:3000`

---

## API

### POST /identify

**Request:**
```json
{
  "email": "mcfly@hillvalley.edu",
  "phoneNumber": "123456"
}
```

**Response:**
```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [23]
  }
}
```

---

## Example Scenarios

### New customer
Send an email and phone that don't exist → creates a new primary contact.

### Returning customer with new info
Send a known phone with a new email → links the new email as a secondary contact under the existing primary.

### Two clusters merging
Send an email from one cluster and a phone from another → the older primary absorbs the newer one. The newer primary becomes secondary.

---

## What I Learned

- How HTTP web services work — requests, responses, routing
- How to design a relational database schema for a real problem
- Raw SQL queries — SELECT, INSERT, UPDATE with dynamic placeholders
- How to think about identity reconciliation as a graph/cluster problem
- TypeScript interfaces and type guards for safe data handling
- Deploying a Node.js service to production
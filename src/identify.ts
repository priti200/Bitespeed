// Brain of the Application
import db from './db';

interface Contact {
    id:number;
    phoneNumber:string;
    email:string;
    linkedId:number | null;
    linkPrecedence:string;
    createdAt:string;
    updatedAt:string;
    deletedAt:string | null;
}

export function handleIdentify(email?:string, phoneNumber?:string){
    //Step 1 -> Finding all the contacts that matches the email or phone number
    const conditions: string[] =[];
    const params: string[]=[];

    if(email){
        conditions.push('email = ?');
        params.push(email);
    }

    if(phoneNumber){
        conditions.push('phoneNumber = ?');
        params.push(phoneNumber);
    }

    const matchingContacts = db.prepare(
        `SELECT * FROM Contact WHERE ${conditions.join(' OR ')}`
    ).all(...params) as Contact[];

    // Step-2 -> no match found, create new primary contact
     if (matchingContacts.length === 0) {
    const now = new Date().toISOString();
    
    const result = db.prepare(`
      INSERT INTO Contact (email, phoneNumber, linkedId, linkPrecedence, createdAt, updatedAt, deletedAt)
      VALUES (?, ?, null, 'primary', ?, ?, null)
    `).run(email ?? null, phoneNumber ?? null, now, now);

    const newId = result.lastInsertRowid as number;

    return {
      primaryContactId: newId,
      emails: email ? [email] : [],
      phoneNumbers: phoneNumber ? [phoneNumber] : [],
      secondaryContactIds: []
    };
  }

  // Step 3: find the full cluster
  // first collect all primary IDs from the matching contacts
  const primaryIds = new Set<number>();

  for (const contact of matchingContacts) {
    if (contact.linkPrecedence === 'primary') {
      primaryIds.add(contact.id);
    } else if (contact.linkedId !== null) {
      primaryIds.add(contact.linkedId);
    }
  }

  const primaryIdList = Array.from(primaryIds);

  // now fetch everyone in the cluster
  const placeholders = primaryIdList.map(() => '?').join(', ');

  const allContacts = db.prepare(`
    SELECT * FROM Contact 
    WHERE id IN (${placeholders}) 
    OR linkedId IN (${placeholders})
  `).all(...primaryIdList, ...primaryIdList) as Contact[];


  // Step 4: check if there are multiple primaries (merge case)
  const primaries = allContacts.filter(c => c.linkPrecedence === 'primary');
  
  if (primaries.length > 1) {
    // sort by createdAt, oldest first
    primaries.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    const oldestPrimary = primaries[0];
    const otherPrimaries = primaries.slice(1);
    
    const now = new Date().toISOString();

    for (const formerPrimary of otherPrimaries) {
      // turn this primary into a secondary
      db.prepare(`
        UPDATE Contact 
        SET linkPrecedence = 'secondary', linkedId = ?, updatedAt = ?
        WHERE id = ?
      `).run(oldestPrimary.id, now, formerPrimary.id);

      // point all its existing secondaries to the new primary
      db.prepare(`
        UPDATE Contact 
        SET linkedId = ?, updatedAt = ?
        WHERE linkedId = ?
      `).run(oldestPrimary.id, now, formerPrimary.id);
    }
  }

  // Step 5: re-fetch the cluster after potential merge
  const updatedCluster = db.prepare(`
    SELECT * FROM Contact 
    WHERE id IN (${placeholders}) 
    OR linkedId IN (${placeholders})
  `).all(...primaryIdList, ...primaryIdList) as Contact[];

  // find the true primary (oldest one)
  const truePrimary = updatedCluster
    .filter(c => c.linkPrecedence === 'primary')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];

  // collect all existing emails and phones in the cluster
  const existingEmails = updatedCluster.map(c => c.email).filter(Boolean);
  const existingPhones = updatedCluster.map(c => c.phoneNumber).filter(Boolean);

  // check if incoming request has new info
  const isNewEmail = email && !existingEmails.includes(email);
  const isNewPhone = phoneNumber && !existingPhones.includes(phoneNumber);

  if (isNewEmail || isNewPhone) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO Contact (email, phoneNumber, linkedId, linkPrecedence, createdAt, updatedAt, deletedAt)
      VALUES (?, ?, ?, 'secondary', ?, ?, null)
    `).run(email ?? null, phoneNumber ?? null, truePrimary.id, now, now);
  }

  // Step 6: fetch final cluster and build response
  const finalCluster = db.prepare(`
    SELECT * FROM Contact 
    WHERE id IN (${placeholders}) 
    OR linkedId IN (${placeholders})
  `).all(...primaryIdList, ...primaryIdList) as Contact[];

  const finalPrimary = finalCluster
    .filter(c => c.linkPrecedence === 'primary')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];

  const secondaries = finalCluster.filter(c => c.linkPrecedence === 'secondary');

  // build emails array, primary's email first
  const allEmails = [
    finalPrimary.email,
    ...secondaries.map(c => c.email)
  ].filter((e): e is string => e !== null && e !== undefined);

  // build phones array, primary's phone first
  const allPhones = [
    finalPrimary.phoneNumber,
    ...secondaries.map(c => c.phoneNumber)
  ].filter((p): p is string => p !== null && p !== undefined);

  // deduplicate
  const uniqueEmails = [...new Set(allEmails)];
  const uniquePhones = [...new Set(allPhones)];

  return {
    primaryContactId: finalPrimary.id,
    emails: uniqueEmails,
    phoneNumbers: uniquePhones,
    secondaryContactIds: secondaries.map(c => c.id)
  };
}
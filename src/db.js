import { MongoClient } from "mongodb";

export async function connectToDatabase(uri, databaseName) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });

  try {
    await client.connect();
    const db = client.db(databaseName);
    await db.command({ ping: 1 });
    return { client, db };
  } catch (error) {
    await client.close();
    throw error;
  }
}

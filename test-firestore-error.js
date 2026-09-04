import { Firestore } from '@google-cloud/firestore';
const db = new Firestore({ projectId: 'demo-project' });
async function run() {
  try {
    await db.collection('test').doc('test').create({});
    await db.collection('test').doc('test').create({});
  } catch (err) {
    console.log("Error code:", err.code, typeof err.code);
  }
}
run();

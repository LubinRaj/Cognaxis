import { Firestore } from '@google-cloud/firestore';
const db = new Firestore({ projectId: 'demo-project' });
async function run() {
  try {
    const e = new Error("Document already exists");
    e.code = 6;
    throw e;
  } catch (err) {
    console.log(err.code);
  }
}
run();

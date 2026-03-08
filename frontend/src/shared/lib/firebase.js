import { getApp, getApps, initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
} from 'firebase/auth'
import { getAnalytics, isSupported } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

let analyticsInstance = null
let authInstance = null
let googleProvider = null

function hasRequiredFirebaseConfig() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.storageBucket &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId,
  )
}

async function initFirebase() {
  if (!hasRequiredFirebaseConfig()) {
    return { app: null, analytics: null }
  }

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig)

  if (!authInstance) {
    authInstance = getAuth(app)
  }
  if (!googleProvider) {
    googleProvider = new GoogleAuthProvider()
  }

  if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
    const supported = await isSupported().catch(() => false)
    if (supported && !analyticsInstance) {
      analyticsInstance = getAnalytics(app)
    }
  }

  return { app, analytics: analyticsInstance, auth: authInstance }
}

export async function signInWithGoogleFirebase() {
  const { auth } = await initFirebase()
  if (!auth || !googleProvider) {
    throw new Error('Firebase is not configured.')
  }
  return signInWithPopup(auth, googleProvider)
}

export async function signInWithEmailFirebase(email, password) {
  const { auth } = await initFirebase()
  if (!auth) {
    throw new Error('Firebase is not configured.')
  }
  return signInWithEmailAndPassword(auth, String(email || '').trim(), String(password || ''))
}

export async function registerWithEmailFirebase(email, password) {
  const { auth } = await initFirebase()
  if (!auth) {
    throw new Error('Firebase is not configured.')
  }
  return createUserWithEmailAndPassword(auth, String(email || '').trim(), String(password || ''))
}

export { initFirebase }
export default initFirebase

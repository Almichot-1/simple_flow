import { getApp, getApps, initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  confirmPasswordReset,
  getAuth,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  verifyPasswordResetCode,
  createUserWithEmailAndPassword,
} from 'firebase/auth'
import { getAnalytics, isSupported } from 'firebase/analytics'
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'

function env(name) {
  return String(import.meta.env[name] || '').trim()
}

const firebaseConfig = {
  apiKey: env('VITE_FIREBASE_API_KEY'),
  authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: env('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: env('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: env('VITE_FIREBASE_APP_ID'),
  measurementId: env('VITE_FIREBASE_MEASUREMENT_ID'),
}

const firestoreDatabaseId = env('VITE_FIREBASE_DATABASE_ID') || '(default)'

function maskApiKey(apiKey) {
  const value = String(apiKey || '')
  if (value.length <= 8) {
    return value
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

export function getFirebaseRuntimeSummary() {
  return {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    apiKeyMasked: maskApiKey(firebaseConfig.apiKey),
  }
}

let analyticsInstance = null
let authInstance = null
let googleProvider = null
let firestoreInstance = null

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
  if (!firestoreInstance) {
    firestoreInstance = getFirestore(app, firestoreDatabaseId)
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

export async function sendPasswordResetEmailFirebase(email) {
  const { auth } = await initFirebase()
  if (!auth) {
    throw new Error('Firebase is not configured.')
  }

  const normalizedEmail = String(email || '').trim().toLowerCase()
  const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/forgot-password` : undefined
  const actionCodeSettings = redirectUrl ? { url: redirectUrl, handleCodeInApp: true } : undefined
  return sendPasswordResetEmail(auth, normalizedEmail, actionCodeSettings)
}

export async function verifyPasswordResetCodeFirebase(code) {
  const { auth } = await initFirebase()
  if (!auth) {
    throw new Error('Firebase is not configured.')
  }
  return verifyPasswordResetCode(auth, String(code || '').trim())
}

export async function confirmPasswordResetFirebase(code, newPassword) {
  const { auth } = await initFirebase()
  if (!auth) {
    throw new Error('Firebase is not configured.')
  }
  return confirmPasswordReset(auth, String(code || '').trim(), String(newPassword || ''))
}

export { initFirebase }
export default initFirebase

export async function publishAgencyRegistrationNotification(payload) {
  const { app } = await initFirebase()
  if (!app || !firestoreInstance) {
    return false
  }

  const normalized = {
    type: 'agency_registration',
    agencyEmail: String(payload?.agencyEmail || '').trim().toLowerCase(),
    country: String(payload?.country || '').trim(),
    phone: String(payload?.phone || '').trim(),
    source: String(payload?.source || 'web-register').trim(),
    createdAt: serverTimestamp(),
  }

  if (!normalized.agencyEmail) {
    return false
  }

  await addDoc(collection(firestoreInstance, 'admin_notifications'), normalized)
  return true
}

export async function subscribeToAdminNotifications(onUpdate, onError, maxItems = 25) {
  const { app } = await initFirebase()
  if (!app || !firestoreInstance) {
    return () => {}
  }

  const notificationsQuery = query(
    collection(firestoreInstance, 'admin_notifications'),
    orderBy('createdAt', 'desc'),
    limit(maxItems),
  )

  let disposed = false

  const loadNotifications = async () => {
    if (disposed) return
    try {
      const snapshot = await getDocs(notificationsQuery)
      const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      onUpdate(rows)
    } catch (err) {
      if (typeof onError === 'function') {
        onError(err)
      }
    }
  }

  await loadNotifications()
  const timer = setInterval(loadNotifications, 15000)

  return () => {
    disposed = true
    clearInterval(timer)
  }
}

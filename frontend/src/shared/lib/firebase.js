import { getApp, getApps, initializeApp } from 'firebase/app'
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

  if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
    const supported = await isSupported().catch(() => false)
    if (supported && !analyticsInstance) {
      analyticsInstance = getAnalytics(app)
    }
  }

  return { app, analytics: analyticsInstance }
}

export { initFirebase }
export default initFirebase

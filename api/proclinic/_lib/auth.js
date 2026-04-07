// ─── Firebase Auth Verification for API Routes ──────────────────────────────
// Verifies Bearer token from Authorization header against Firebase Auth REST API.
// Returns user info if valid, sends 401 and returns null if not.
// Caches verified tokens in memory to avoid repeated network calls.

const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';

// Module-level cache: token -> { user, expiresAt }
const _authCache = new Map();
const AUTH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const AUTH_CACHE_MAX = 20; // max cached tokens (prevent memory leak)

export async function verifyAuth(req, res) {
  const authHeader = req.headers?.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ success: false, error: 'Unauthorized: missing token' });
    return null;
  }

  // Check cache first (instant — no network call)
  const cached = _authCache.get(token);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.user;
  }

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      }
    );

    if (!response.ok) {
      res.status(401).json({ success: false, error: 'Unauthorized: invalid token' });
      return null;
    }

    const data = await response.json();
    const user = data.users?.[0] || null;

    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized: user not found' });
      return null;
    }

    // Cache the result
    if (_authCache.size >= AUTH_CACHE_MAX) {
      // Evict oldest entry
      const firstKey = _authCache.keys().next().value;
      _authCache.delete(firstKey);
    }
    _authCache.set(token, { user, expiresAt: Date.now() + AUTH_CACHE_TTL });

    return user;
  } catch (err) {
    res.status(401).json({ success: false, error: 'Unauthorized: token verification failed' });
    return null;
  }
}

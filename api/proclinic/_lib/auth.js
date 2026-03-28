// ─── Firebase Auth Verification for API Routes ──────────────────────────────
// Verifies Bearer token from Authorization header against Firebase Auth REST API.
// Returns user info if valid, sends 401 and returns null if not.

const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';

export async function verifyAuth(req, res) {
  const authHeader = req.headers?.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ success: false, error: 'Unauthorized: missing token' });
    return null;
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

    return user;
  } catch (err) {
    res.status(401).json({ success: false, error: 'Unauthorized: token verification failed' });
    return null;
  }
}

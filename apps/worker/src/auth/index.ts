/**
 * Authentication module
 * Microsoft OAuth integration adapted from harmonia
 */

import type { Env } from '../env';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  roles: string[];
}

export interface Session {
  user: User;
  expiresAt: number;
}

// Session cookie name
const SESSION_COOKIE = 'dc_session';

/**
 * Generate a random state parameter for OAuth
 */
function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Sign a session JWT
 */
async function signSession(session: Session, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(session));
  
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, data);
  const payload = btoa(JSON.stringify(session));
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  return `${payload}.${sig}`;
}

/**
 * Verify and decode a session JWT
 */
async function verifySession(token: string, secret: string): Promise<Session | null> {
  try {
    const [payloadB64, sigB64] = token.split('.');
    if (!payloadB64 || !sigB64) return null;
    
    const payload = JSON.parse(atob(payloadB64)) as Session;
    
    // Check expiration
    if (payload.expiresAt < Date.now()) return null;
    
    // Verify signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    const signature = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));
    const data = encoder.encode(JSON.stringify(payload));
    
    const valid = await crypto.subtle.verify('HMAC', key, signature, data);
    if (!valid) return null;
    
    return payload;
  } catch {
    return null;
  }
}

/**
 * Get session from request cookies
 */
export async function getSession(request: Request, env: Env): Promise<Session | null> {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return null;
  
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  
  return verifySession(match[1], env.AUTH_SECRET);
}

/**
 * Set session cookie in response
 */
export async function setSession(response: Response, session: Session, env: Env): Promise<Response> {
  const token = await signSession(session, env.AUTH_SECRET);
  const headers = new Headers(response.headers);
  
  headers.set(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`
  );
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

/**
 * Clear session cookie
 */
export function clearSession(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
  );
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

/**
 * Handle Microsoft OAuth login initiation
 */
export async function handleMicrosoftLogin(request: Request, env: Env): Promise<Response> {
  const state = generateState();
  const redirectUri = new URL(request.url).origin + '/api/auth/microsoft/callback';
  
  // Store state in cookie for verification
  const stateCookie = `dc_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
  
  const authUrl = new URL(`https://login.microsoftonline.com/${env.AUTH_MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set('client_id', env.AUTH_MICROSOFT_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('state', state);
  
  return new Response(null, {
    status: 302,
    headers: {
      'Location': authUrl.toString(),
      'Set-Cookie': stateCookie
    }
  });
}

/**
 * Handle Microsoft OAuth callback
 */
export async function handleMicrosoftCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  
  // Verify state
  const cookie = request.headers.get('Cookie') || '';
  const stateMatch = cookie.match(/dc_oauth_state=([^;]+)/);
  const savedState = stateMatch ? stateMatch[1] : null;
  
  if (!state || state !== savedState) {
    return new Response(JSON.stringify({ error: 'Invalid state' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (!code) {
    return new Response(JSON.stringify({ error: 'No code provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Exchange code for token
    const redirectUri = url.origin + '/api/auth/microsoft/callback';
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${env.AUTH_MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.AUTH_MICROSOFT_CLIENT_ID,
          client_secret: env.AUTH_MICROSOFT_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      }
    );
    
    if (!tokenResponse.ok) {
      throw new Error('Token exchange failed');
    }
    
    const tokens = await tokenResponse.json() as { id_token: string };
    
    // Parse ID token (simplified - in production, verify signature)
    const idTokenParts = tokens.id_token.split('.');
    const idTokenPayload = JSON.parse(atob(idTokenParts[1])) as {
      oid: string;
      email: string;
      name: string;
      picture?: string;
    };
    
    const user: User = {
      id: idTokenPayload.oid,
      email: idTokenPayload.email,
      name: idTokenPayload.name,
      avatar: idTokenPayload.picture,
      roles: ['user'] // Default role, could be loaded from DB
    };
    
    const session: Session = {
      user,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    };
    
    // Redirect to app with session
    const response = new Response(null, {
      status: 302,
      headers: { 'Location': env.UI_URL || '/' }
    });
    
    return setSession(response, session, env);
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Authentication failed: ' + (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle logout
 */
export function handleLogout(): Response {
  const response = new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
  return clearSession(response);
}

/**
 * Get current user
 */
export async function handleMe(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify(session.user), {
    headers: { 'Content-Type': 'application/json' }
  });
}
